import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEMES, SCHEME_BY_ID, SCHEME_CATEGORIES, searchSchemes, type SchemeCategory } from '@shared/govt/schemes';
import { recommend } from '@shared/govt/eligibility';
import { computeNotices, type Notice } from '@shared/govt/notices';
import { docsProgress } from '@shared/govt/cases';
import { useGovt } from '../../state';
import { useTx } from '../../useTx';
import { Icon } from '../../icons';

/** "closes in 18 days" / "trending" — the one line a notice carries. */
export function noticeLine(n: Notice, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (n.kind === 'trending') return t('notice.trending');
  if (n.daysLeft === 0) return t('notice.today');
  if (n.daysLeft === 1) return t('notice.tomorrow');
  return t('notice.days', { n: n.daysLeft });
}

/** Reception: what is worth your attention, every scheme by purpose, and your files. */
export function ReceptionTool() {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const profile = useGovt((s) => s.profile);
  const cases = useGovt((s) => s.cases);
  const send = useGovt((s) => s.sendToRegistration);
  const resume = useGovt((s) => s.resumeCase);
  const remove = useGovt((s) => s.removeCase);
  const [tab, setTab] = useState<'for' | 'browse' | 'files'>('for');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<SchemeCategory | 'all'>('all');

  const notices = useMemo(() => (profile ? computeNotices(profile, new Date(), 4) : []), [profile]);
  const forYou = useMemo(() => (profile ? recommend(profile).filter((m) => m.verdict.pending.length <= 1).slice(0, 5) : []), [profile]);
  const list = useMemo(() => (q.trim() ? searchSchemes(q, 14) : SCHEMES).filter((s) => cat === 'all' || s.category === cat), [q, cat]);

  return (
    <div className="sk-card sk-col" style={{ gap: 14 }}>
      <div className="sk-tabs" role="tablist" style={{ alignSelf: 'flex-start' }}>
        {([['for', t('tool.reception.tabFor')], ['browse', t('tool.reception.tabBrowse', { count: SCHEMES.length })], ['files', t('tool.reception.tabFiles', { count: cases.length })]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'for' && (
        <>
          {notices.length > 0 && (
            <div className="sk-col" style={{ gap: 8 }}>
              <div className="sk-row sk-small sk-muted"><Icon name="pin" size={15} /> {t('notice.title')}</div>
              {notices.map((n) => (
                <div key={n.scheme.id} className={`sk-notice${n.kind === 'trending' ? ' trend' : ''}`}>
                  <Icon name={n.kind === 'closing' ? 'calendar' : 'bell'} size={20} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{tx(n.scheme.name)}</b>
                    <div className="sk-small sk-muted">{noticeLine(n, t)}{n.label ? ` · ${tx(n.label)}` : ''}</div>
                  </div>
                  <button className="sk-btn sm" onClick={() => send({ schemeId: n.scheme.id })}>{t('desk.reception.apply')}</button>
                </div>
              ))}
              <p className="sk-hint">{t('notice.confirm')}</p>
            </div>
          )}
          <div className="sk-small sk-muted">{t('desk.reception.forYou')}</div>
          <div className="sk-list">
            {forYou.map(({ scheme, verdict }) => (
              <div className="sk-item" key={scheme.id}>
                <span className="ico"><Icon name={scheme.category} size={18} /></span>
                <div className="body"><b>{tx(scheme.name)}</b><p>{tx(scheme.short)}</p></div>
                <div className="sk-row" style={{ flexShrink: 0 }}>
                  <span className={`sk-chip ${verdict.pending.length ? 'warn' : 'ok'}`}>{verdict.pending.length ? t('desk.reception.maybe') : t('desk.reception.looksGood')}</span>
                  <button className="sk-btn sm ghost" onClick={() => send({ schemeId: scheme.id })}>{t('desk.reception.apply')}</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'browse' && (
        <>
          <div className="sk-field"><input aria-label={t('desk.reception.search')} placeholder={t('desk.reception.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="sk-row">
            <button className={`sk-chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>{t('common.all')}</button>
            {SCHEME_CATEGORIES.map((c) => (
              <button key={c} className={`sk-chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}><Icon name={c} size={14} /> {t(`schemecat.${c}`)}</button>
            ))}
          </div>
          {cat !== 'all' && (
            <button className="sk-btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => send({ category: cat })}>
              {t('desk.reception.sendCategory', { category: t(`schemecat.${cat}`) })} <Icon name="arrowRight" size={14} />
            </button>
          )}
          <div className="sk-list">
            {list.length === 0 && <p className="sk-muted">{t('desk.reception.none')}</p>}
            {list.map((s) => (
              <div className="sk-item" key={s.id}>
                <span className="ico"><Icon name={s.category} size={18} /></span>
                <div className="body"><b>{tx(s.name)}</b><p>{tx(s.benefit)}</p></div>
                <button className="sk-btn sm ghost" onClick={() => send({ schemeId: s.id })}>{t('desk.reception.apply')}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'files' && (
        <div className="sk-list">
          {cases.length === 0 && <p className="sk-muted">{t('tool.reception.noFiles')}</p>}
          {cases.map((c) => {
            const s = SCHEME_BY_ID[c.schemeId];
            const p = docsProgress(c, s.docs);
            return (
              <div className="sk-item" key={c.id}>
                <span className="ico"><Icon name="file" size={18} /></span>
                <div className="body">
                  <b>{tx(s.name)}</b>
                  <p>{c.id} · {t('desk.reception.docsCount', { done: p.done, total: p.total })} · {c.submittedAt ? t('status.submitted') : t(`desk.${c.desk === 'reception' ? 'registration' : c.desk}.title`)}</p>
                </div>
                <div className="sk-row" style={{ flexShrink: 0 }}>
                  <button className="sk-btn sm" onClick={() => resume(c.id)}>{t('common.resume')}</button>
                  <button className="sk-icon-btn" aria-label={t('common.delete')} onClick={() => { if (window.confirm(t('desk.reception.confirmDelete'))) void remove(c.id); }}><Icon name="trash" size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
