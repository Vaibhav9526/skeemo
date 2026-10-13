import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEME_BY_ID, SCHEME_CATEGORIES, schemesIn, type SchemeCategory } from '@shared/govt/schemes';
import { evaluate } from '@shared/govt/eligibility';
import { useGovt } from '../../state';
import { useTx } from '../../useTx';
import { Icon } from '../../icons';
import { SchemeBrief } from '../../ui';

/** Registration: choose a topic and a scheme in three short steps (or just tell the counter in the message box). */
export function RegistrationTool() {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const profile = useGovt((s) => s.profile);
  const prefill = useGovt((s) => s.prefill);
  const register = useGovt((s) => s.registerScheme);
  const [category, setCategory] = useState<SchemeCategory | ''>('');
  const [schemeId, setSchemeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (prefill.schemeId && SCHEME_BY_ID[prefill.schemeId]) { setSchemeId(prefill.schemeId); setCategory(SCHEME_BY_ID[prefill.schemeId].category); }
    else if (prefill.category) { setCategory(prefill.category); setSchemeId(''); }
  }, [prefill]);

  const scheme = schemeId ? SCHEME_BY_ID[schemeId] : null;
  const verdict = scheme && profile ? evaluate(scheme, profile) : null;

  return (
    <div className="sk-card sk-col" style={{ gap: 16 }}>
      <div className="sk-col" style={{ gap: 8 }}>
        <div className="sk-title">{t('desk.registration.q1')}</div>
        <div className="sk-row">
          {SCHEME_CATEGORIES.map((c) => (
            <button key={c} className={`sk-chip${category === c ? ' on' : ''}`} onClick={() => { setCategory(c); setSchemeId(''); }}>
              <Icon name={c} size={14} /> {t(`schemecat.${c}`)}
            </button>
          ))}
        </div>
        <p className="sk-hint">{t('tool.registration.orTell')}</p>
      </div>

      {category && (
        <div className="sk-field">
          <label htmlFor="reg-scheme">{t('desk.registration.q2')}</label>
          <select id="reg-scheme" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
            <option value="">{t('common.choose')}</option>
            {schemesIn(category).map((s) => <option key={s.id} value={s.id}>{tx(s.name)}</option>)}
          </select>
        </div>
      )}

      {scheme && (
        <div className="sk-col" style={{ gap: 12, borderTop: '1px solid var(--line2)', paddingTop: 14 }}>
          <SchemeBrief scheme={scheme} />
          {verdict?.status === 'ineligible' && <div className="sk-note">{t('desk.registration.heads')}</div>}
          {error && <div className="sk-err" role="alert">{error}</div>}
          <button
            className="sk-btn" disabled={busy}
            onClick={async () => { setBusy(true); setError(''); const c = await register(scheme.id); setBusy(false); if (!c) setError(t('common.failed')); }}
          >
            {t('desk.registration.register')} <Icon name="arrowRight" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
