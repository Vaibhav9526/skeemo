import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { alternatives, evaluate, type Answers } from '@shared/govt/eligibility';
import { floor } from '@/scene/govt/draft/floorBusDraft';
import { useActiveCase, useGovt } from '../state';
import { Say, SchemeBrief, useAutoSpeak } from '../ui';
import { useTx } from '../useTx';
import { describeCheck } from '../eligText';

/** Eligibility Check: the basic screening — straight verdict, with the reasons and what else you could try. */
export function EligibilityDesk() {
  const { t } = useTranslation('govtdraft');
  const tx = useTx();
  const c = useActiveCase();
  const profile = useGovt((s) => s.profile);
  const replace = useGovt((s) => s.replaceCase);
  const send = useGovt((s) => s.sendFile);
  const open = useGovt((s) => s.openDesk);
  const toReg = useGovt((s) => s.sendToRegistration);
  const [saved, setSaved] = useState(false);
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
  const [local, setLocal] = useState<Answers>({});
  const answers: Answers = useMemo(() => ({ ...(c?.answers ?? {}), ...local }), [c?.answers, local]);
  const verdict = useMemo(() => (scheme && profile ? evaluate(scheme, profile, answers) : null), [scheme, profile, answers]);
  const alts = useMemo(() => (scheme && profile && verdict?.status === 'ineligible' ? alternatives(scheme, profile) : []), [scheme, profile, verdict?.status]);

  const hello = c ? t('desk.eligibility.hello') : t('desk.eligibility.noCase');
  useAutoSpeak(`eligibility-hello-${c?.id ?? ''}`, hello, 'eligibility');

  if (!c || !scheme || !profile || !verdict) {
    return (
      <>
        <Say id="eligibility-none" desk="eligibility" text={hello}>{hello}</Say>
        <button className="g-btn alt" onClick={() => open('registration')}>{t('desk.documents.goRegister')} →</button>
      </>
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
    const ok = r.verdict.status === 'eligible';
    floor({ type: 'say', actor: 'eligibility', text: ok ? t('desk.eligibility.sayOk') : r.verdict.status === 'ineligible' ? t('desk.eligibility.sayNo') : t('desk.eligibility.sayMore') });
  };

  const status = verdict.status;
  const final = saved || c.eligibility;
  const resultText = status === 'eligible' ? t('desk.eligibility.verdictOk', { scheme: tx(scheme.name) }) : status === 'ineligible'
    ? t('desk.eligibility.verdictNo', { scheme: tx(scheme.name), reasons: verdict.failed.map((f) => describeCheck(f, t, tx)).join(' ') }) : '';
  useAutoSpeak(`eligibility-result-${c.id}-${status}`, resultText, 'eligibility', !!final && !!resultText);

  return (
    <>
      <Say id={`eligibility-hello-${c.id}`} desk="eligibility" text={hello}>{hello}</Say>
      <section className="g-card"><SchemeBrief scheme={scheme} compact /></section>

      <section className="g-card">
        <div className="g-h">{t('desk.eligibility.checks')}</div>
        <div style={{ marginTop: 6 }}>
          {verdict.checks.filter((k) => k.kind !== 'question').map((k, i) => (
            <div className="g-check" key={i}>
              <span className={`mark ${k.ok ? 'ok' : 'bad'}`} aria-hidden>{k.ok ? '✓' : '✕'}</span>
              <span>{describeCheck(k, t, tx)}</span>
            </div>
          ))}
        </div>
        {verdict.indicativeIncome && <div className="g-note" style={{ marginTop: 6 }}>{t('desk.eligibility.indicative')}</div>}
      </section>

      {(scheme.questions?.length ?? 0) > 0 && (
        <section className="g-card">
          <div className="g-h">{t('desk.eligibility.questions')}</div>
          {scheme.questions!.map((q) => (
            <fieldset key={q.id} style={{ border: 0, padding: 0, margin: '10px 0 0' }}>
              <legend style={{ fontWeight: 600, marginBottom: 6 }}>{tx(q.text)}</legend>
              <div className="g-row">
                {(['yes', 'no'] as const).map((v) => (
                  <label key={v} className={`g-opt${answers[q.id] === v ? ' sel' : ''}`} style={{ flex: 1 }}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === v} onChange={() => { setLocal({ ...local, [q.id]: v }); setSaved(false); }} />
                    <span>{t(`common.${v}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      )}

      <button className="g-btn wide" disabled={status === 'incomplete'} onClick={() => void run()}>{status === 'incomplete' ? t('desk.eligibility.answerAll') : t('desk.eligibility.runCheck')}</button>

      {final && status !== 'incomplete' && (
        <section className="g-card" style={{ textAlign: 'center' }}>
          <span className={`g-stamp ${status === 'eligible' ? 'ok' : 'bad'}`}>{status === 'eligible' ? t('desk.eligibility.stampOk') : t('desk.eligibility.stampNo')}</span>
          <p style={{ margin: '12px 0 0', textAlign: 'left' }}>{resultText}</p>
          {status === 'eligible' && (
            <>
              <div className="g-note" style={{ textAlign: 'left', marginTop: 10 }}>{t('common.disclaimer')}</div>
              <button className="g-btn go wide" style={{ marginTop: 12 }} onClick={() => void send('form')}>{t('desk.eligibility.toForm')} →</button>
            </>
          )}
          {status === 'ineligible' && (
            <div style={{ textAlign: 'left' }}>
              {alts.length > 0 && <div className="g-h" style={{ marginTop: 14 }}>{t('desk.eligibility.instead')}</div>}
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {alts.map(({ scheme: a }) => (
                  <div key={a.id} className="g-card">
                    <SchemeBrief scheme={a} compact />
                    <button className="g-btn small go" style={{ marginTop: 8 }} onClick={() => toReg({ schemeId: a.id })}>{t('desk.reception.apply')} →</button>
                  </div>
                ))}
              </div>
              <div className="g-row" style={{ marginTop: 12 }}>
                <button className="g-btn ghost small" onClick={() => void send('help')}>{t('desk.eligibility.askHelp')}</button>
                <button className="g-btn ghost small" onClick={() => open('reception')}>{t('desk.eligibility.seeAll')}</button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
