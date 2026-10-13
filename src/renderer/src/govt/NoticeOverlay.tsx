import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeNotices, type Notice } from '@shared/govt/notices';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { DOCS } from '@shared/govt/documents';
import { evaluate } from '@shared/govt/eligibility';
import { useGovt } from './state';
import { useTx } from './useTx';
import { Icon } from './icons';
import { describeCheck } from './eligText';
import { noticeLine } from './chat/tools/ReceptionTool';

/** The notice board brought to the front: the one you picked is pinned large in the middle, the rest blur behind it. Only schemes that fit you are ever pinned. */
export function NoticeOverlay() {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const id = useGovt((s) => s.noticeId);
  const profile = useGovt((s) => s.profile);
  const openNotice = useGovt((s) => s.openNotice);
  const send = useGovt((s) => s.sendToRegistration);
  const setView = useGovt((s) => s.setView);

  const notices = useMemo(() => {
    if (!profile || !id) return [] as Notice[];
    const list = computeNotices(profile, new Date(), 6);
    if (!list.some((n) => n.scheme.id === id)) {
      const extra = computeNotices(profile, new Date(), 60).find((n) => n.scheme.id === id);
      if (extra) list.unshift(extra);
    }
    return list.slice(0, 6);
  }, [profile, id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); openNotice(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id, openNotice]);

  const focus = notices.find((n) => n.scheme.id === id);
  if (!id || !profile || !focus) return null;
  const scheme = focus.scheme;
  const verdict = evaluate(scheme, profile);
  const why = verdict.checks.filter((c) => c.ok === true && c.kind !== 'question');
  const others = notices.filter((n) => n.scheme.id !== id);

  return (
    <div className="sk-notice-overlay" role="dialog" aria-modal="true" aria-label={t('notice.title')} onClick={() => openNotice(null)}>
      <div className="sk-board-front" onClick={(e) => e.stopPropagation()}>
        <div className="sk-board-head"><Icon name="pin" size={16} /> {t('notice.title')}
          <button className="sk-icon-btn" aria-label={t('common.close')} onClick={() => openNotice(null)}><Icon name="x" size={18} /></button>
        </div>
        <div className="sk-board-cork">
          <div className="sk-pins left">
            {others.slice(0, Math.ceil(others.length / 2)).map((n, i) => (
              <button key={n.scheme.id} className={`sk-pin-card paper${i % 4}`} onClick={() => openNotice(n.scheme.id)} style={{ transform: `rotate(${i % 2 ? 2.2 : -2.4}deg)` }}>
                <b>{tx(n.scheme.name).replace(/\s*\(.*\)\s*$/, '')}</b>
                <span className={`badge ${n.kind}`}>{noticeLine(n, t as never)}</span>
              </button>
            ))}
          </div>

          <article className="sk-focus-note">
            <span className="sk-focus-pin" aria-hidden />
            <div className="sk-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span className="sk-chip acc"><Icon name={scheme.category} size={13} /> {t(`schemecat.${scheme.category}`)}</span>
              <span className={`sk-chip ${focus.kind === 'closing' ? 'bad' : 'ok'}`}><Icon name={focus.kind === 'closing' ? 'clock' : 'bell'} size={13} /> {noticeLine(focus, t as never)}</span>
            </div>
            <h2>{tx(scheme.name)}</h2>
            <div className="sk-deadline">
              <Icon name="calendar" size={18} />
              <div>
                <b>{focus.kind === 'closing' && focus.closes ? new Date(`${focus.closes}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : t('marquee.anytime')}</b>
                <span>{focus.label ? tx(focus.label) : t('notice.rolling')} · {t('notice.confirm')}</span>
              </div>
            </div>
            <p>{tx(scheme.benefit)}</p>
            <div className="sk-col" style={{ gap: 4 }}>
              <div className="sk-small sk-muted">{t('notice.why')}</div>
              {why.slice(0, 4).map((c, i) => <div className="sk-check" key={i}><Icon name="checkCircle" size={16} className="mark ok" /><span>{describeCheck(c, t, tx)}</span></div>)}
              {verdict.pending.length > 0 && <div className="sk-check"><Icon name="help" size={16} className="mark wait" /><span>{t('notice.pending', { count: verdict.pending.length })}</span></div>}
            </div>
            <div className="sk-small sk-muted">{t('notice.docs')}: {scheme.docs.map((d) => tx(DOCS[d].name).replace(/\s*\(.*\)\s*$/, '')).join(' · ')}</div>
            <div className="sk-row" style={{ marginTop: 6 }}>
              <button className="sk-btn" onClick={() => { send({ schemeId: scheme.id }); openNotice(null); setView('office'); }}>{t('notice.start')} <Icon name="arrowRight" size={16} /></button>
              <a className="sk-btn ghost" href={scheme.portal} target="_blank" rel="noreferrer"><Icon name="link" size={15} /> {t('notice.portal')}</a>
            </div>
          </article>

          <div className="sk-pins right">
            {others.slice(Math.ceil(others.length / 2)).map((n, i) => (
              <button key={n.scheme.id} className={`sk-pin-card paper${(i + 2) % 4}`} onClick={() => openNotice(n.scheme.id)} style={{ transform: `rotate(${i % 2 ? -2 : 2.3}deg)` }}>
                <b>{tx(n.scheme.name).replace(/\s*\(.*\)\s*$/, '')}</b>
                <span className={`badge ${n.kind}`}>{noticeLine(n, t as never)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

void SCHEME_BY_ID;
