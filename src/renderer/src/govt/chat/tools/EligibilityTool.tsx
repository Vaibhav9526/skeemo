import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { alternatives, evaluate, type Answers } from '@shared/govt/eligibility';
import { floor } from '@/scene/govt/floorBus';
import { useActiveCase, useGovt } from '../../state';
import { useTx } from '../../useTx';
import { Icon } from '../../icons';
import { SchemeBrief, StatusIcon, useAutoSpeak } from '../../ui';
import { describeCheck } from '../../eligText';

/** Eligibility Check: the basic screening — a straight verdict, the reasons, and what else you could try. */
export function EligibilityTool({ resultOnly = false }: { resultOnly?: boolean }) {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const c = useActiveCase();
  const profile = useGovt((s) => s.profile);
  const replace = useGovt((s) => s.replaceCase);
  const send = useGovt((s) => s.sendFile);
  const openDesk = useGovt((s) => s.openDesk);
  const toReg = useGovt((s) => s.sendToRegistration);
  const [saved, setSaved] = useState(false);
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
  const [local, setLocal] = useState<Answers>({});
  const answers: Answers = useMemo(() => ({ ...(c?.answers ?? {}), ...local }), [c?.answers, local]);
  const verdict = useMemo(() => (scheme && profile ? evaluate(scheme, profile, answers) : null), [scheme, profile, answers]);
  const alts = useMemo(() => (scheme && profile && verdict?.status === 'ineligible' ? alternatives(scheme, profile) : []), [scheme, profile, verdict?.status]);

  const status = verdict?.status;
  const final = saved || !!c?.eligibility;
  const resultText = !scheme || !verdict ? '' : status === 'eligible'
    ? t('desk.eligibility.verdictOk', { scheme: tx(scheme.name) })
    : status === 'ineligible' ? t('desk.eligibility.verdictNo', { scheme: tx(scheme.name), reasons: verdict.failed.map((f) => describeCheck(f, t, tx)).join(' ') }) : '';
  useAutoSpeak(`elig-result-${c?.id ?? ''}-${status}`, resultText, 'eligibility', final && !!resultText);

  if (!c || !scheme || !profile || !verdict) {
    return (
      <div className="sk-card sk-col">
        <p className="sk-muted">{t('desk.eligibility.noCase')}</p>
        <button className="sk-btn" style={{ alignSelf: 'flex-start' }} onClick={() => openDesk('registration')}>{t('desk.documents.goRegister')} <Icon name="arrowRight" size={16} /></button>
      </div>
    );
  }

  const run = async () => {
    floor({ type: 'busy', actor: 'eligibility', on: true });
    await window.cth.govtCaseAnswers(c.id, local);
    const r = await window.cth.govtEligibilityRun(c.id);
    floor({ type: 'busy', actor: 'eligibility', on: false });
    if (!r) return;
    replace(r.case);
    setSaved(true);
    floor({ type: 'say', actor: 'eligibility', text: r.verdict.status === 'eligible' ? t('desk.eligibility.sayOk') : r.verdict.status === 'ineligible' ? t('desk.eligibility.sayNo') : t('desk.eligibility.sayMore') });
  };

  const result = final && status !== 'incomplete' && (
    <div className="sk-col" style={{ gap: 12 }}>
      <div className="sk-row"><span className={`sk-stamp ${status === 'eligible' ? 'ok' : 'bad'}`}>{status === 'eligible' ? t('desk.eligibility.stampOk') : t('desk.eligibility.stampNo')}</span></div>
      <p>{resultText}</p>
      {status === 'eligible' && (
        <>
          <p className="sk-hint">{t('common.disclaimer')}</p>
          <button className="sk-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void send('form')}>{t('desk.eligibility.toForm')} <Icon name="arrowRight" size={16} /></button>
        </>
      )}
      {status === 'ineligible' && (
        <>
          {alts.length > 0 && <div className="sk-small sk-muted">{t('desk.eligibility.instead')}</div>}
          <div className="sk-list">
            {alts.map(({ scheme: a }) => (
              <div className="sk-item" key={a.id}>
                <span className="ico"><Icon name={a.category} size={18} /></span>
                <div className="body"><b>{tx(a.name)}</b><p>{tx(a.short)}</p></div>
                <button className="sk-btn sm ghost" onClick={() => toReg({ schemeId: a.id })}>{t('desk.reception.apply')}</button>
              </div>
            ))}
          </div>
          <div className="sk-row">
            <button className="sk-btn ghost sm" onClick={() => void send('help')}>{t('desk.eligibility.askHelp')}</button>
            <button className="sk-btn ghost sm" onClick={() => openDesk('reception')}>{t('desk.eligibility.seeAll')}</button>
          </div>
        </>
      )}
    </div>
  );

  if (resultOnly) return <div className="sk-card">{result}</div>;

  return (
    <div className="sk-card sk-col" style={{ gap: 14 }}>
      <SchemeBrief scheme={scheme} compact />
      <div>
        <div className="sk-small sk-muted" style={{ marginBottom: 4 }}>{t('desk.eligibility.checks')}</div>
        {verdict.checks.filter((k) => k.kind !== 'question').map((k, i) => (
          <div className="sk-check" key={i}><StatusIcon ok={k.ok} /><span>{describeCheck(k, t, tx)}</span></div>
        ))}
        {verdict.indicativeIncome && <p className="sk-hint" style={{ marginTop: 6 }}>{t('desk.eligibility.indicative')}</p>}
      </div>

      {(scheme.questions?.length ?? 0) > 0 && (
        <div className="sk-col" style={{ gap: 10 }}>
          <div className="sk-small sk-muted">{t('desk.eligibility.questions')}</div>
          {scheme.questions!.map((q) => (
            <fieldset key={q.id} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 550, marginBottom: 6 }}>{tx(q.text)}</legend>
              <div className="sk-row" style={{ flexWrap: 'nowrap' }}>
                {(['yes', 'no'] as const).map((v) => (
                  <label key={v} className={`sk-opt${answers[q.id] === v ? ' on' : ''}`} style={{ flex: 1 }}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === v} onChange={() => { setLocal({ ...local, [q.id]: v }); setSaved(false); }} />
                    <span>{t(`common.${v}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <button className="sk-btn" disabled={status === 'incomplete'} style={{ alignSelf: 'flex-start' }} onClick={() => void run()}>
        {status === 'incomplete' ? t('desk.eligibility.answerAll') : t('desk.eligibility.runCheck')}
      </button>
      {result && <div style={{ borderTop: '1px solid var(--line2)', paddingTop: 14 }}>{result}</div>}
    </div>
  );
}
