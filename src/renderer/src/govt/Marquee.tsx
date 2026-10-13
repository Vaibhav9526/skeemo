import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeNotices } from '@shared/govt/notices';
import { useGovt } from './state';
import { useTx } from './useTx';
import { Icon } from './icons';

/** The strip along the bottom: schemes relevant to you, scrolling past, each with its deadline (or "apply any time"). */
export function Marquee() {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const profile = useGovt((s) => s.profile);
  const openNotice = useGovt((s) => s.openNotice);
  const items = useMemo(() => (profile ? computeNotices(profile, new Date(), 14) : []), [profile]);
  if (!items.length) return null;

  const line = (n: (typeof items)[number]): string => {
    if (n.kind === 'trending') return t('marquee.anytime');
    if (n.daysLeft === 0) return t('notice.today');
    if (n.daysLeft === 1) return t('notice.tomorrow');
    return t('notice.days', { n: n.daysLeft });
  };
  const entries = (suffix: string) => items.map((n) => (
    <button key={n.scheme.id + suffix} className={`sk-mq-item${n.kind === 'closing' ? ' closing' : ''}`} onClick={() => openNotice(n.scheme.id)}>
      <Icon name={n.scheme.category} size={15} />
      <b>{tx(n.scheme.name).replace(/\s*\(.*\)\s*$/, '')}</b>
      <span>{line(n)}</span>
    </button>
  ));
  // the track holds the list twice so the loop is seamless; speed follows length
  return (
    <div className="sk-marquee" role="region" aria-label={t('marquee.label')}>
      <div className="sk-mq-label"><Icon name="calendar" size={15} /> {t('marquee.label')}</div>
      <div className="sk-mq-window">
        <div className="sk-mq-track" style={{ animationDuration: `${Math.max(40, items.length * 7)}s` }}>
          {entries('')}{entries('-dup')}
        </div>
      </div>
    </div>
  );
}
