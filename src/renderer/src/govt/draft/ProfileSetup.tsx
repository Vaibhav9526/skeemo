import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AREAS, CATEGORIES, GENDERS, OCCUPATIONS, STATES, parseIncome, validateProfile,
  type CitizenProfile, type ProfileIssue,
} from '@shared/govt/profile';
import { GOVT_LANGUAGES } from '@shared/govt/languages';
import { lookFor } from './art/people';
import { Pixie } from './ui';
import { useGovt } from './state';
import { floor } from '@/scene/govt/draft/floorBusDraft';

/** First-login form (and "edit my details"): who you are, so every counter can screen schemes for you. */
export function ProfileSetup({ existing, onClose }: { existing: CitizenProfile | null; onClose?: () => void }) {
  const { t, i18n } = useTranslation('govtdraft');
  const setProfile = useGovt((s) => s.setProfile);
  const setLang = useGovt((s) => s.setLang);
  const [name, setName] = useState(existing?.name ?? '');
  const [age, setAge] = useState(existing ? String(existing.age) : '');
  const [gender, setGender] = useState<string>(existing?.gender ?? '');
  const [state, setState] = useState(existing?.state ?? '');
  const [occupation, setOccupation] = useState<string>(existing?.occupation ?? '');
  const [income, setIncome] = useState(existing ? String(existing.income) : '');
  const [category, setCategory] = useState<string>(existing?.category ?? 'general');
  const [area, setArea] = useState<string>(existing?.area ?? '');
  const [seed, setSeed] = useState(existing?.look.seed ?? 0);
  const [issues, setIssues] = useState<ProfileIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const incomeNum = parseIncome(income);
  const look = useMemo(() => lookFor({
    name: name || 'Citizen', age: parseInt(age, 10) || 30,
    gender: (gender || 'male') as CitizenProfile['gender'], occupation: (occupation || 'other') as CitizenProfile['occupation'],
    state: state || 'Delhi', look: { seed },
  }), [name, age, gender, occupation, state, seed]);

  const bad = (k: ProfileIssue) => (issues.includes(k) ? ' bad' : '');

  const save = async () => {
    const draft = { name, age: parseInt(age, 10), gender, state, occupation, incomeText: income, category, area: area || undefined, look: { seed } };
    const v = validateProfile(draft as never);
    if (!v.ok || !area) { setIssues(v.ok ? ['area'] : [...v.issues, ...(area ? [] : (['area'] as const))]); return; }
    setIssues([]); setBusy(true); setError('');
    const r = await window.cth.govtProfileSave(draft).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) { setError(t('profile.saveFailed')); return; }
    setProfile(r.profile);
    if (!existing) floor({ type: 'arrive' });
    onClose?.();
  };

  return (
    <div className="g-modal" role="dialog" aria-modal="true" aria-labelledby="g-prof-title">
      <div className="g-sheet">
        <header>
          <h1 id="g-prof-title">{existing ? t('profile.editTitle') : t('profile.title')}</h1>
          <select className="g-select" aria-label={t('common.language')} value={i18n.language} onChange={(e) => void setLang(e.target.value)}>
            {GOVT_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
          {existing && onClose && <button className="g-iconbtn" aria-label={t('common.close')} onClick={onClose}>✕</button>}
        </header>
        <div className="content">
          <p className="g-muted" style={{ margin: 0 }}>{existing ? t('profile.editIntro') : t('profile.intro')}</p>
          <div className="g-twocol">
            <div className="g-avatarbox">
              <Pixie look={look} scale={5} bust label={name} />
              <b style={{ textAlign: 'center' }}>{name || t('profile.yourName')}</b>
              <button type="button" className="g-btn small" onClick={() => setSeed((s) => (s + 1) % 1000)}>🎲 {t('profile.shuffle')}</button>
              <span className="g-muted" style={{ textAlign: 'center', fontSize: 11 }}>{t('profile.avatarHint')}</span>
            </div>
            <div style={{ flex: 1, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', minWidth: 0 }}>
              <div className={`g-field${bad('name')}`} style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="p-name">{t('profile.name')}</label>
                <input id="p-name" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('profile.namePh')} />
                {issues.includes('name') && <span className="err">{t('profile.errName')}</span>}
              </div>
              <div className={`g-field${bad('age')}`}>
                <label htmlFor="p-age">{t('profile.age')}</label>
                <input id="p-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                {issues.includes('age') && <span className="err">{t('profile.errAge')}</span>}
              </div>
              <div className={`g-field${bad('gender')}`}>
                <label htmlFor="p-gender">{t('profile.gender')}</label>
                <select id="p-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">{t('common.choose')}</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
                </select>
                {issues.includes('gender') && <span className="err">{t('profile.errChoose')}</span>}
              </div>
              <div className={`g-field${bad('state')}`} style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="p-state">{t('profile.state')}</label>
                <select id="p-state" value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">{t('common.choose')}</option>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {issues.includes('state') && <span className="err">{t('profile.errChoose')}</span>}
              </div>
              <div className={`g-field${bad('occupation')}`} style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="p-occ">{t('profile.occupation')}</label>
                <select id="p-occ" value={occupation} onChange={(e) => setOccupation(e.target.value)}>
                  <option value="">{t('common.choose')}</option>
                  {OCCUPATIONS.map((o) => <option key={o} value={o}>{t(`occ.${o}`)}</option>)}
                </select>
                {issues.includes('occupation') && <span className="err">{t('profile.errChoose')}</span>}
              </div>
              <div className={`g-field${bad('income')}`} style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="p-inc">{t('profile.income')}</label>
                <input id="p-inc" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="1,20,000  /  2.5 lakh" />
                <span className="g-muted">{Number.isFinite(incomeNum) && income ? `₹${incomeNum.toLocaleString('en-IN')} ${t('profile.perYear')}` : t('profile.incomeHint')}</span>
                {issues.includes('income') && <span className="err">{t('profile.errIncome')}</span>}
              </div>
              <div className={`g-field${bad('category')}`}>
                <label htmlFor="p-cat">{t('profile.category')}</label>
                <select id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
                </select>
              </div>
              <div className={`g-field${bad('area')}`}>
                <label htmlFor="p-area">{t('profile.area')}</label>
                <select id="p-area" value={area} onChange={(e) => setArea(e.target.value)}>
                  <option value="">{t('common.choose')}</option>
                  {AREAS.map((a) => <option key={a} value={a}>{t(`area.${a}`)}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="g-note">🔒 {t('profile.privacy')}</div>
          {error && <div className="g-err" role="alert">{error}</div>}
          <div className="g-row" style={{ justifyContent: 'flex-end' }}>
            {existing && onClose && <button className="g-btn ghost" onClick={onClose}>{t('common.cancel')}</button>}
            <button className="g-btn go" disabled={busy} onClick={() => void save()}>{existing ? t('profile.save') : t('profile.enter')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
