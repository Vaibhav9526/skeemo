import { CATEGORY_EMOJI } from '../categoryIcons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_LABEL, SCHEMES, SCHEME_CATEGORIES, SCHEME_BY_ID, searchSchemes, type SchemeCategory } from '@shared/govt/schemes';
import { recommend } from '@shared/govt/eligibility';
import { docsProgress } from '@shared/govt/cases';
import { useGovt } from '../state';
import { Say, SchemeBrief, useAutoSpeak } from '../ui';
import { useTx } from '../useTx';

/** Reception: every scheme on offer, sorted by what it is for. Pick a category or a scheme and the peon carries your file to Registration. */
export function ReceptionDesk() {
  const { t } = useTranslation('govtdraft');
  const tx = useTx();
  const profile = useGovt((s) => s.profile);
  const cases = useGovt((s) => s.cases);
  const send = useGovt((s) => s.sendToRegistration);
  const resume = useGovt((s) => s.resumeCase);
  const remove = useGovt((s) => s.removeCase);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<SchemeCategory | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);

  const hello = t('desk.reception.hello', { name: profile?.name ?? '', count: SCHEMES.length });
  useAutoSpeak('reception-hello', hello, 'reception');

  const forYou = useMemo(() => (profile ? recommend(profile).filter((m) => m.verdict.pending.length <= 1).slice(0, 4) : []), [profile]);
  const list = useMemo(() => {
    const base = q.trim() ? searchSchemes(q, 12) : SCHEMES;
    return base.filter((s) => cat === 'all' || s.category === cat);
  }, [q, cat]);
  const counts = useMemo(() => Object.fromEntries(SCHEME_CATEGORIES.map((c) => [c, SCHEMES.filter((s) => s.category === c).length])), []);

  return (
    <>
      <Say id="reception-hello" desk="reception" text={hello}>{hello}</Say>

      {cases.length > 0 && (
        <section className="g-card">
          <div className="g-h">{t('desk.reception.yourFiles')}</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {cases.slice(0, 5).map((c) => {
              const s = SCHEME_BY_ID[c.schemeId];
              const p = docsProgress(c, s.docs);
              return (
                <div key={c.id} className="g-row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="g-title" style={{ fontSize: 13 }}>{tx(s.name)}</div>
                    <div className="g-muted">{c.id} · {t('desk.reception.docsCount', { done: p.done, total: p.total })} · {c.submittedAt ? t('status.submitted') : t(`desk.${c.desk === 'reception' ? 'registration' : c.desk}.title`)}</div>
                  </div>
                  <div className="g-row">
                    <button className="g-btn small" onClick={() => resume(c.id)}>{t('common.resume')}</button>
                    <button className="g-btn small ghost" aria-label={t('common.delete')} onClick={() => { if (window.confirm(t('desk.reception.confirmDelete'))) void remove(c.id); }}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {forYou.length > 0 && !q && cat === 'all' && (
        <section>
          <div className="g-h">⭐ {t('desk.reception.forYou')}</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {forYou.map(({ scheme, verdict }) => (
              <div key={scheme.id} className="g-card">
                <SchemeBrief scheme={scheme} compact />
                <div className="g-row" style={{ marginTop: 8 }}>
                  <span className={`g-chip ${verdict.pending.length ? 'warn' : 'ok'}`}>{verdict.pending.length ? t('desk.reception.maybe') : t('desk.reception.looksGood')}</span>
                  <span style={{ flex: 1 }} />
                  <button className="g-btn small go" onClick={() => send({ schemeId: scheme.id })}>{t('desk.reception.apply')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="g-h">{t('desk.reception.allSchemes', { count: SCHEMES.length })}</div>
        <div className="g-field" style={{ marginTop: 6 }}>
          <input aria-label={t('desk.reception.search')} placeholder={t('desk.reception.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="g-row" style={{ marginTop: 8 }}>
          <button className={`g-chip${cat === 'all' ? ' sel' : ''}`} onClick={() => setCat('all')}>{t('common.all')} {SCHEMES.length}</button>
          {SCHEME_CATEGORIES.map((c) => (
            <button key={c} className={`g-chip${cat === c ? ' sel' : ''}`} onClick={() => setCat(c)}>{CATEGORY_EMOJI[c]} {tx(CATEGORY_LABEL[c])} {counts[c]}</button>
          ))}
        </div>
        {cat !== 'all' && (
          <button className="g-btn alt wide" style={{ marginTop: 10 }} onClick={() => send({ category: cat })}>
            {t('desk.reception.sendCategory', { category: tx(CATEGORY_LABEL[cat]) })} →
          </button>
        )}
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {list.length === 0 && <div className="g-muted">{t('desk.reception.none')}</div>}
          {list.map((s) => (
            <div key={s.id} className={`g-card pick${open === s.id ? ' sel' : ''}`} onClick={() => setOpen(open === s.id ? null : s.id)}>
              <SchemeBrief scheme={s} compact={open !== s.id} />
              {open === s.id && (
                <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                  <div className="g-muted">{s.ministry}</div>
                  <div className="g-row" style={{ marginTop: 8 }}>
                    <button className="g-btn go" onClick={() => send({ schemeId: s.id })}>{t('desk.reception.apply')} →</button>
                    <button className="g-btn ghost small" onClick={() => void navigator.clipboard?.writeText(s.portal)}>{t('desk.reception.copyLink')}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <div className="g-note">{t('common.disclaimer')}</div>
    </>
  );
}
