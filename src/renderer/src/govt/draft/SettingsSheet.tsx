import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTORS, type ActorId } from './art/people';
import { useGovt } from './state';
import { GOVT_LANGUAGES } from '@shared/govt/languages';

const VOICE_DESKS: ActorId[] = ['reception', 'registration', 'documents', 'eligibility', 'form', 'help', 'peon'];

export function SettingsSheet() {
  const { t, i18n } = useTranslation('govtdraft');
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
    <div className="g-modal" role="dialog" aria-modal="true" aria-labelledby="g-set-title" onClick={close}>
      <div className="g-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h1 id="g-set-title">{t('settings.title')}</h1>
          <button className="g-iconbtn" aria-label={t('common.close')} onClick={close}>✕</button>
        </header>
        <div className="content">
          <section className="g-card">
            <div className="g-h">{t('common.language')}</div>
            <div className="g-row" style={{ marginTop: 8 }}>
              {GOVT_LANGUAGES.map((l) => (
                <button key={l.code} className={`g-chip${i18n.language === l.code ? ' sel' : ''}`} onClick={() => void setLang(l.code)}>{l.native}</button>
              ))}
            </div>
          </section>

          <section className="g-card">
            <div className="g-h">🔊 {t('settings.voice')}</div>
            <p className="g-muted" style={{ margin: '6px 0' }}>{t('settings.voiceWhy')}</p>
            <div className="g-row">
              <div className="g-field" style={{ flex: 1, minWidth: 200 }}>
                <label htmlFor="el-key">{t('settings.elKey')} {settings.hasKey && <span className="g-chip ok">{t('settings.keySet')}</span>}</label>
                <input id="el-key" type="password" autoComplete="off" value={key} placeholder={settings.hasKey ? '••••••••••••' : 'sk_…'} onChange={(e) => setKey(e.target.value)} />
              </div>
              <button className="g-btn" disabled={!key.trim()} style={{ alignSelf: 'flex-end' }} onClick={() => void saveKey()}>{t('common.save')}</button>
              {settings.hasKey && <button className="g-btn ghost" style={{ alignSelf: 'flex-end' }} onClick={async () => { await window.cth.govtVoiceSetKey(''); setSettings(await window.cth.govtSettingsGet()); setMsg(t('settings.keyRemoved')); }}>{t('common.remove')}</button>}
            </div>
            {!settings.encrypted && <div className="g-err">{t('settings.noEncrypt')}</div>}
            {msg && <div className="g-muted" role="status">{msg}</div>}
            <label className="g-opt" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={settings.autoVoice} onChange={async (e) => setSettings(await window.cth.govtSettingsSet({ autoVoice: e.target.checked }))} />
              <span><b>{t('settings.autoVoice')}</b><br /><span className="g-muted">{t('settings.autoVoiceWhy')}</span></span>
            </label>
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('settings.voicesPer')}</summary>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {VOICE_DESKS.map((d) => (
                  <div key={d} className="g-row">
                    <span style={{ width: 150 }}>{ACTORS[d].name}</span>
                    <input className="g-input" style={{ flex: 1 }} placeholder={settings.defaultVoices[d]} value={voices[d] ?? settings.voices[d] ?? ''}
                      onChange={(e) => setVoices({ ...voices, [d]: e.target.value })}
                      onBlur={async () => { if (voices[d] !== undefined) setSettings(await window.cth.govtSettingsSet({ voices: { [d]: voices[d] } })); }} />
                  </div>
                ))}
                <span className="g-muted">{t('settings.voiceIdHint')}</span>
              </div>
            </details>
          </section>

          <section className="g-card">
            <div className="g-h">🧭 {t('settings.sj')}</div>
            <div className="g-row" style={{ marginTop: 8 }}>
              <span className={`g-chip ${settings.superJargonFound ? 'ok' : 'warn'}`}>{settings.superJargonFound ? t('settings.sjFound') : t('settings.sjMissing')}</span>
              <button className="g-btn ghost small" onClick={async () => { const r = await window.cth.govtGuideBrowse(); if (r.ok && r.settings) setSettings(r.settings); }}>{t('desk.form.browse')}</button>
            </div>
          </section>

          <section className="g-card">
            <div className="g-h">🛠 {t('settings.you')}</div>
            <div className="g-row" style={{ marginTop: 8 }}>
              <button className="g-btn ghost" onClick={() => { close(); useGovt.getState().setProfileOpen(true); }}>{t('settings.editProfile')}</button>
              <button className="g-btn ghost" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={async () => {
                if (!window.confirm(t('settings.confirmReset'))) return;
                await window.cth.govtProfileClear();
                useGovt.setState({ profile: null, cases: [], activeCaseId: null, desk: null });
                close();
              }}>{t('settings.reset')}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
