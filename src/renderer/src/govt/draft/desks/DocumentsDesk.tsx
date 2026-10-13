import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DOCS, type DocId } from '@shared/govt/documents';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { docsProgress, type DocCheck, type DocRecord } from '@shared/govt/cases';
import { floor } from '@/scene/govt/draft/floorBusDraft';
import { useActiveCase, useGovt } from '../state';
import { Say, SchemeBrief, useAutoSpeak } from '../ui';
import { useTx } from '../useTx';

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function CheckLine({ c }: { c: DocCheck }) {
  const { t } = useTranslation('govtdraft');
  const mark = c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'wait';
  return (
    <div className="g-check">
      <span className={`mark ${mark}`} aria-hidden>{c.ok === true ? '✓' : c.ok === false ? '✕' : '!'}</span>
      <span>{t(`doccheck.${c.id}`, c.data as Record<string, string | number> | undefined)}</span>
    </div>
  );
}

function DocRow({ docId, record, caseId }: { docId: DocId; record?: DocRecord; caseId: string }) {
  const { t } = useTranslation('govtdraft');
  const tx = useTx();
  const spec = DOCS[docId];
  const replace = useGovt((s) => s.replaceCase);
  const [limit, setLimit] = useState(String(spec.maxKB));
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [showHow, setShowHow] = useState(false);
  const [fresh, setFresh] = useState<DocRecord | null>(null);
  const shown = fresh ?? record;

  const run = async (path: string) => {
    setBusy(true); setError('');
    floor({ type: 'busy', actor: 'documents', on: true });
    const limitKB = Math.max(5, parseInt(limit, 10) || spec.maxKB);
    const r = await window.cth.govtDocVerify({ caseId, docId, path, limitKB }).catch(() => null);
    floor({ type: 'busy', actor: 'documents', on: false });
    setBusy(false);
    if (!r || !r.ok) { setError(r && !r.ok ? r.error : t('common.failed')); return; }
    setFresh(r.record);
    replace(r.case);
    floor({ type: 'say', actor: 'documents', text: r.record.status === 'verified' ? t('desk.documents.sayOk') : r.record.status === 'rejected' ? t('desk.documents.sayBad') : t('desk.documents.sayWarn') });
  };

  const pick = async () => {
    const r = await window.cth.govtDocPick(docId);
    if (r.ok && r.path) await run(r.path);
  };

  const status = shown?.status;
  return (
    <section className={`g-card${status === 'verified' ? '' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; const p = f ? window.cth.govtPathForFile(f) : ''; if (p) void run(p); }}
      style={over ? { borderColor: 'var(--saffron)', background: 'var(--saffron-soft)' } : undefined}>
      <div className="g-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="g-title" style={{ fontSize: 14 }}>{tx(spec.name)}</div>
          <div className="g-muted">{spec.formats.join(' / ').toUpperCase()} · ≤ {spec.maxKB} KB{spec.minKB ? ` · ≥ ${spec.minKB} KB` : ''}</div>
        </div>
        {status && <span className={`g-chip ${status === 'verified' ? 'ok' : status === 'rejected' ? 'bad' : 'warn'}`}>{t(`docstatus.${status}`)}</span>}
      </div>

      <button className="g-btn ghost small" style={{ marginTop: 6 }} onClick={() => setShowHow(!showHow)}>{showHow ? '▾' : '▸'} {t('desk.documents.howToGet')}</button>
      {showHow && <div className="g-note" style={{ marginTop: 6 }}>{tx(spec.where)}</div>}

      <div className="g-row" style={{ marginTop: 10 }}>
        <div className="g-field" style={{ width: 118 }}>
          <label htmlFor={`lim-${docId}`} style={{ fontSize: 11 }}>{t('desk.documents.limit')}</label>
          <input id={`lim-${docId}`} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </div>
        <button className="g-btn" disabled={busy} style={{ alignSelf: 'flex-end' }} onClick={() => void pick()}>{busy ? t('common.checking') : shown ? t('desk.documents.replace') : t('desk.documents.upload')}</button>
        <span className="g-muted" style={{ alignSelf: 'flex-end' }}>{t('desk.documents.orDrop')}</span>
      </div>
      {error && <div className="g-err" role="alert" style={{ marginTop: 8 }}>{error}</div>}

      {shown && (
        <div style={{ marginTop: 10, borderTop: '2px dashed var(--line)', paddingTop: 8 }}>
          <div className="g-muted">{shown.originalName} · {kb(shown.bytesBefore)}{shown.bytesAfter !== shown.bytesBefore ? ` → ${kb(shown.bytesAfter)}` : ''}</div>
          {shown.checks.map((c, i) => <CheckLine key={i} c={c} />)}
          {shown.fields && Object.keys(shown.fields).length > 0 && (
            <div className="g-note" style={{ marginTop: 6 }}>
              {Object.entries(shown.fields).filter(([k]) => k !== 'notes').map(([k, v]) => <div key={k}><b>{t(`field.${k}`, { defaultValue: k })}:</b> {v}</div>)}
              {shown.fields.notes && <div>💬 {shown.fields.notes}</div>}
            </div>
          )}
          {shown.fittedPath && (
            <div className="g-row" style={{ marginTop: 8 }}>
              <button className="g-btn ghost small" onClick={() => void window.cth.govtDocReveal(caseId, docId)}>📂 {t('desk.documents.show')}</button>
              <button className="g-btn ghost small" onClick={async () => { const c = await window.cth.govtCaseRemoveDoc(caseId, docId); if (c) replace(c); setFresh(null); }}>🗑 {t('common.remove')}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Document Verification: the checklist for this scheme, each paper checked and fitted to the upload size. */
export function DocumentsDesk() {
  const { t } = useTranslation('govtdraft');
  const c = useActiveCase();
  const settings = useGovt((s) => s.settings);
  const setSettings = useGovt((s) => s.setSettings);
  const ai = useGovt((s) => s.aiAvailable);
  const send = useGovt((s) => s.sendFile);
  const open = useGovt((s) => s.openDesk);
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
  const hello = c ? t('desk.documents.hello', { count: scheme?.docs.length ?? 0 }) : t('desk.documents.noCase');
  useAutoSpeak(`documents-hello-${c?.id ?? ''}`, hello, 'documents');

  if (!c || !scheme) {
    return (
      <>
        <Say id="documents-none" desk="documents" text={hello}>{hello}</Say>
        <button className="g-btn alt" onClick={() => open('registration')}>{t('desk.documents.goRegister')} →</button>
      </>
    );
  }
  const p = docsProgress(c, scheme.docs);
  const allDone = p.done === p.total;

  return (
    <>
      <Say id={`documents-hello-${c.id}`} desk="documents" text={hello}>{hello}</Say>
      <section className="g-card">
        <SchemeBrief scheme={scheme} compact />
        <div className="g-muted" style={{ marginTop: 4 }}>{c.id}</div>
        <div className="g-row" style={{ marginTop: 8 }}>
          <div className="g-bar" style={{ flex: 1 }}><i style={{ width: `${(p.done / Math.max(1, p.total)) * 100}%` }} /></div>
          <b>{p.done}/{p.total}</b>
        </div>
      </section>

      <section className="g-card">
        <label className="g-opt" style={{ border: 0, padding: 0, background: 'none' }}>
          <input type="checkbox" checked={!!settings?.aiDocRead} onChange={async (e) => setSettings(await window.cth.govtSettingsSet({ aiDocRead: e.target.checked }))} />
          <span><b>{t('desk.documents.aiRead')}</b><br /><span className="g-muted">{t('desk.documents.aiReadWhy')} {ai === false ? ` ${t('desk.documents.aiMissing')}` : ''}</span></span>
        </label>
      </section>

      {scheme.docs.map((d) => <DocRow key={d} docId={d} record={c.docs[d]} caseId={c.id} />)}

      <div className="g-row">
        <button className="g-btn ghost small" onClick={() => void window.cth.govtDocOpenFolder(c.id)}>📂 {t('desk.documents.openFolder')}</button>
      </div>
      <button className="g-btn go wide" disabled={!allDone} onClick={() => void send('eligibility')}>{allDone ? t('desk.documents.next') : t('desk.documents.needAll')} →</button>
      <div className="g-note">{t('desk.documents.privacy')}</div>
    </>
  );
}
