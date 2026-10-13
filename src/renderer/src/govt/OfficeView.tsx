import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GovtFloor, type BoardNote } from '@/scene/govt/GovtFloor';
import { computeNotices } from '@shared/govt/notices';
import { lookFor } from './art/people';
import { useGovt } from './state';
import { useTx } from './useTx';
import { Icon } from './icons';
import { noticeLine } from './chat/tools/ReceptionTool';
import { DockChat } from './chat/ChatView';
import { Marquee } from './Marquee';

/** "PM Kisan Samman Nidhi (…)" → a short title that fits a pinned card. */
function shortTitle(name: string): string {
  const base = name.replace(/\s*\(.*\)\s*$/, '').trim();
  return base.length > 30 ? `${base.slice(0, 29)}…` : base;
}

/**
 * The office: the floor on the left (the camera follows you as you walk to a counter), the counter's chat docked on the right,
 * and the deadline marquee along the bottom. Wheel to zoom.
 */
export function OfficeView() {
  const { t, i18n } = useTranslation('govt');
  const tx = useTx();
  const profile = useGovt((s) => s.profile);
  const desk = useGovt((s) => s.desk);
  const style = useGovt((s) => s.style);
  const selectDesk = useGovt((s) => s.selectDesk);
  const openNotice = useGovt((s) => s.openNotice);
  const look = useMemo(() => (profile ? lookFor(profile) : null), [profile]);

  const raw = useMemo(() => (profile ? computeNotices(profile, new Date(), 4) : []), [profile]);
  const notes: BoardNote[] = raw.map((n) => ({
    id: n.scheme.id, title: shortTitle(tx(n.scheme.name)), tone: n.kind,
    badge: noticeLine(n, t as never).toUpperCase(),
  }));
  const key = notes.map((n) => `${n.id}|${n.title}|${n.badge}`).join('~') + i18n.language;
  const stable = useMemo(() => notes, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || !look) return null;
  return (
    <div className="sk-office-wrap">
      <div className="sk-office-row">
        <div className="sk-office">
          <GovtFloor
            key={style} look={look} citizenName={profile.name.split(' ')[0]} desk={desk} style={style} notes={stable} emptyNote={t('notice.empty')}
            onArrive={(d) => selectDesk(d)} onNote={(id) => openNotice(id)}
          />
          <div className="sk-office-hint"><Icon name="compass" size={14} /> {t('office.hint')}</div>
        </div>
        <DockChat />
      </div>
      <Marquee />
    </div>
  );
}
