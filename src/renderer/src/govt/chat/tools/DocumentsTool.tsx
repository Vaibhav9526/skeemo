import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DOCS, type DocId } from '@shared/govt/documents';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { docsProgress, type DocCheck, type DocRecord } from '@shared/govt/cases';
import { floor } from '@/scene/govt/floorBus';
import { useActiveCase, useGovt } from '../../state';
import { useTx } from '../../useTx';
import { Icon } from '../../icons';
import { SchemeBrief, StatusIcon } from '../../ui';

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function CheckLine({ c }: { c: DocCheck }) {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const data = { ...(c.data ?? {}) } as Record<string, string | number>;
  if (c.id === 'type_detected' && typeof data.doc === 'string' && data.doc in DOCS) data.name = tx(DOCS[data.doc as DocId].name);
  return (
    <div className="sk-check">
      <StatusIcon ok={c.ok} />
      <span>{t(`doccheck.${c.id}`, data)}</span>
    </div>
  );
}

function DocRow({ docId, record, caseId }: { docId: DocId; record?: DocRecord; caseId: string }) {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const spec = DOCS[docId];
  const replace = useGovt((s) => s.replaceCase);
  const vault = useGovt((s) => s.vault);
  const [limit, setLimit] = useState(String(spec.maxKB));
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<DocRecord | null>(null);
  const shown = fresh ?? record;
  const mine = vault.filter((v) => v.docType === docId && v.status !== 'invalid');

  const finish = (r: { ok: true; record: DocRecord; case: import('@shared/govt/cases').CaseFile } | { ok: false; error: string } | null) => {
    floor({ type: 'busy', actor: 'documents', on: false });
    setBusy(false);
    if (!r || !r.ok) { setError(r && !r.ok ? r.error : t('common.failed')); return; }
    setFresh(r.record);
    replace(r.case);
    setOpen(r.record.status !== 'verified');
  };
  const begin = () => { setBusy(true); setError(''); floor({ type: 'busy', actor: 'documents', on: true }); };
  const limitKB = () => Math.max(5, parseInt(limit, 10) || spec.maxKB);

  const run = async (path: string) => { begin(); finish(await window.cth.govtDocVerify({ caseId, docId, path, limitKB: limitKB() }).catch(() => null)); };
  const pick = async () => { const r = await window.cth.govtDocPick(docId); if (r.ok && r.path) await run(r.path); };
  const fromVault = async (vaultId: string) => { begin(); finish(await window.cth.govtVaultUse({ vaultId, caseId, docId, limitKB: limitKB() }).catch(() => null)); };

  const status = shown?.status;
  return (
    <div
      className="sk-item" style={{ flexWrap: 'wrap', background: over ? 'var(--acc-soft)' : undefined, borderRadius: 10 }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; const p = f ? window.cth.govtPathForFile(f) : ''; if (p) void run(p); }}
    >
      <span className="ico" style={status === 'verified' ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : status === 'rejected' ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : status ? { background: 'var(--warn-soft)', color: 'var(--warn)' } : undefined}>
        <Icon name={status === 'verified' ? 'checkCircle' : status === 'rejected' ? 'xCircle' : status ? 'alert' : 'file'} size={18} />
      </span>
      <div className="body">
        <b>{tx(spec.name)}</b>
        <p>{spec.formats.join(', ').toUpperCase()} · {t('docx.upTo', { n: spec.maxKB })}{shown ? ` · ${shown.originalName} (${kb(shown.bytesBefore)}${shown.bytesAfter !== shown.bytesBefore ? ` → ${kb(shown.bytesAfter)}` : ''})` : ''}</p>
      </div>
      <div className="sk-row" style={{ flexShrink: 0 }}>
        {status && <span className={`sk-chip ${status === 'verified' ? 'ok' : status === 'rejected' ? 'bad' : 'warn'}`}>{t(`docstatus.${status}`)}</span>}
        {mine.length > 0 && (
          <select className="sk-select" style={{ height: 30, fontSize: 13 }} value="" aria-label={t('docx.fromVault')} disabled={busy} onChange={(e) => e.target.value && void fromVault(e.target.value)}>
            <option value="">{t('docx.fromVault')}</option>
            {mine.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
        <button className="sk-btn sm ghost" disabled={busy} onClick={() => void pick()}><Icon name="upload" size={14} /> {busy ? t('common.checking') : shown ? t('desk.documents.replace') : t('desk.documents.upload')}</button>
        <button className="sk-icon-btn" aria-label={t('docx.details')} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} /></button>
      </div>
      {error && <div className="sk-err" role="alert" style={{ width: '100%' }}>{error}</div>}
      {open && (
        <div style={{ width: '100%', paddingLeft: 46 }} className="sk-col">
          {shown && shown.checks.map((c, i) => <CheckLine key={i} c={c} />)}
          {shown?.fields && Object.keys(shown.fields).filter((k) => k !== 'notes').length > 0 && (
            <div className="sk-note">{Object.entries(shown.fields).filter(([k]) => k !== 'notes').map(([k, v]) => <div key={k}>{t(`field.${k}`, { defaultValue: k })}: {v}</div>)}</div>
          )}
          <div className="sk-row">
            <div className="sk-field" style={{ width: 130 }}>
              <label htmlFor={`lim-${docId}`}>{t('desk.documents.limit')}</label>
              <input id={`lim-${docId}`} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, '').slice(0, 5))} />
            </div>
            {shown?.fittedPath && <button className="sk-btn sm ghost" onClick={() => void window.cth.govtDocReveal(caseId, docId)}><Icon name="folder" size={14} /> {t('desk.documents.show')}</button>}
            {shown && <button className="sk-btn sm ghost" onClick={async () => { const c = await window.cth.govtCaseRemoveDoc(caseId, docId); if (c) replace(c); setFresh(null); }}><Icon name="trash" size={14} /> {t('common.remove')}</button>}
          </div>
          <p className="sk-hint">{tx(spec.where)}</p>
        </div>
      )}
    </div>
  );
}

/** Document Verification: the papers this scheme needs — upload, or take them from the vault. */
export function DocumentsTool() {
  const { t } = useTranslation('govt');
  const c = useActiveCase();
  const settings = useGovt((s) => s.settings);
  const setSettings = useGovt((s) => s.setSettings);
  const ai = useGovt((s) => s.aiAvailable);
  const send = useGovt((s) => s.sendFile);
  const openDesk = useGovt((s) => s.openDesk);
  const setView = useGovt((s) => s.setView);
  const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;

  if (!c || !scheme) {
    return (
      <div className="sk-card sk-col">
        <p className="sk-muted">{t('desk.documents.noCase')}</p>
        <button className="sk-btn" style={{ alignSelf: 'flex-start' }} onClick={() => openDesk('registration')}>{t('desk.documents.goRegister')} <Icon name="arrowRight" size={16} /></button>
      </div>
    );
  }
  const p = docsProgress(c, scheme.docs);
  const allDone = p.done === p.total;

  return (
    <div className="sk-card sk-col" style={{ gap: 12 }}>
      <SchemeBrief scheme={scheme} compact />
      <div className="sk-row">
        <div className="sk-bar" style={{ flex: 1 }}><i style={{ width: `${(p.done / Math.max(1, p.total)) * 100}%` }} /></div>
        <span className="sk-small sk-muted">{p.done}/{p.total}</span>
      </div>
      <div className="sk-list">{scheme.docs.map((d) => <DocRow key={d} docId={d} record={c.docs[d]} caseId={c.id} />)}</div>
      <label className="sk-opt" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" checked={!!settings?.aiDocRead} onChange={async (e) => setSettings(await window.cth.govtSettingsSet({ aiDocRead: e.target.checked }))} style={{ marginTop: 4 }} />
        <span><b>{t('desk.documents.aiRead')}</b><br /><span className="sk-small sk-muted">{t('desk.documents.aiReadWhy')}{ai === false ? ` ${t('desk.documents.aiMissing')}` : ''}</span></span>
      </label>
      <div className="sk-row">
        <button className="sk-btn ghost sm" onClick={() => void window.cth.govtDocOpenFolder(c.id)}><Icon name="folder" size={14} /> {t('desk.documents.openFolder')}</button>
        <button className="sk-btn ghost sm" onClick={() => setView('vault')}><Icon name="vault" size={14} /> {t('nav.vault')}</button>
        <span style={{ flex: 1 }} />
        <button className="sk-btn" disabled={!allDone} onClick={() => void send('eligibility')}>{allDone ? t('desk.documents.next') : t('desk.documents.needAll')} <Icon name="arrowRight" size={16} /></button>
      </div>
      <p className="sk-hint">{t('desk.documents.privacy')}</p>
    </div>
  );
}
