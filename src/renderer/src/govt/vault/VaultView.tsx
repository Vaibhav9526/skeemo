import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DOCS } from '@shared/govt/documents';
import { SCHEME_BY_ID } from '@shared/govt/schemes';
import { VAULT_FOLDERS, folderOf, type VaultDoc, type VaultFolder } from '@shared/govt/vaultTypes';
import { useGovt } from '../state';
import { useTx } from '../useTx';
import { Icon, type IconName } from '../icons';
import { CheckLine } from '../chat/tools/DocumentsTool';

const FOLDER_STYLE: Record<VaultFolder, { icon: IconName; bg: string }> = {
  identity: { icon: 'idcard', bg: 'var(--p-lilac)' },
  income: { icon: 'file', bg: 'var(--p-blue)' },
  land: { icon: 'housing', bg: 'var(--p-peach)' },
  bank: { icon: 'business', bg: 'var(--p-mint)' },
  education: { icon: 'education', bg: 'var(--p-sand)' },
  work: { icon: 'employment', bg: 'var(--p-pink)' },
  other: { icon: 'folder', bg: 'var(--p-sand)' },
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function DocCard({ d }: { d: VaultDoc }) {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const refresh = useGovt((s) => s.refreshVault);
  const [open, setOpen] = useState(false);
  const icon: IconName = d.status === 'valid' ? 'checkCircle' : d.status === 'invalid' ? 'xCircle' : 'alert';
  return (
    <div className={`sk-doc ${d.status}`}>
      <span className="ico"><Icon name={icon} size={22} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sk-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="sk-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
            <div className="sk-small sk-muted">{d.docType ? tx(DOCS[d.docType].name) : t('vault.notRecognised')} · {kb(d.size)} · {new Date(d.addedAt).toLocaleDateString()}</div>
          </div>
          <div className="sk-row" style={{ flexShrink: 0 }}>
            <span className={`sk-chip ${d.status === 'valid' ? 'ok' : d.status === 'invalid' ? 'bad' : 'warn'}`}>{t(`vault.status.${d.status}`)}</span>
            <button className="sk-icon-btn" aria-label={t('docx.details')} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} /></button>
          </div>
        </div>
        {open && (
          <div className="sk-col" style={{ marginTop: 10, gap: 6 }}>
            <div className="sk-chip acc" style={{ alignSelf: 'flex-start' }}><Icon name="scan" size={13} /> {t(`vault.read.${d.read}`)}</div>
            {d.checks.map((c, i) => <CheckLine key={i} c={c} />)}
            <div className="sk-row">
              <button className="sk-btn ghost sm" onClick={() => void window.cth.govtVaultReveal(d.id)}><Icon name="folder" size={14} /> {t('desk.documents.show')}</button>
              <button className="sk-btn ghost sm" onClick={async () => { if (window.confirm(t('vault.confirmRemove'))) { await window.cth.govtVaultRemove(d.id); await refresh(); } }}><Icon name="trash" size={14} /> {t('common.remove')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The file vault: every paper kept in one place, read by local OCR and judged valid / needs a look / invalid — plus how many applications you have filed. */
export function VaultView() {
  const { t } = useTranslation('govt');
  const tx = useTx();
  const vault = useGovt((s) => s.vault);
  const cases = useGovt((s) => s.cases);
  const ocr = useGovt((s) => s.ocrAvailable);
  const refresh = useGovt((s) => s.refreshVault);
  const resume = useGovt((s) => s.resumeCase);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<VaultFolder | null>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const add = async (paths: string[]) => {
    if (!paths.length) return;
    setBusy(paths.length); setErrors([]);
    const r = await window.cth.govtVaultAdd(paths).catch(() => null);
    setBusy(0);
    if (r?.errors.length) setErrors(r.errors);
    await refresh();
  };
  const pick = async () => add(await window.cth.govtVaultPick());

  const counts = useMemo(() => {
    const m = Object.fromEntries(VAULT_FOLDERS.map((f) => [f, [] as VaultDoc[]])) as Record<VaultFolder, VaultDoc[]>;
    for (const d of vault) m[folderOf(d.docType)].push(d);
    return m;
  }, [vault]);
  const shown = useMemo(() => {
    const base = folder ? counts[folder] : vault;
    const s = q.trim().toLowerCase();
    return s ? base.filter((d) => `${d.name} ${d.docType ? DOCS[d.docType].name.en : ''}`.toLowerCase().includes(s)) : base;
  }, [vault, counts, folder, q]);

  const valid = vault.filter((d) => d.status === 'valid').length;
  const check = vault.filter((d) => d.status === 'check').length;
  const invalid = vault.filter((d) => d.status === 'invalid').length;
  const submitted = cases.filter((c) => c.submittedAt);
  const schol = cases.filter((c) => SCHEME_BY_ID[c.schemeId]?.category === 'education');
  const scholDone = schol.filter((c) => c.submittedAt);

  return (
    <div className="sk-vault"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files].map((f) => window.cth.govtPathForFile(f)).filter(Boolean)); }}>
      <div className="sk-vault-bar">
        <div className="sk-vault-search"><Icon name="search" size={17} /><input value={q} placeholder={t('vault.search')} aria-label={t('vault.search')} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="sk-spacer" style={{ flex: 1 }} />
        <span className="sk-small sk-muted">{t('vault.summary', { count: vault.length })}</span>
        <button className="sk-btn" disabled={busy > 0} onClick={() => void pick()}><Icon name="plus" size={16} /> {busy ? t('vault.reading', { count: busy }) : t('vault.add')}</button>
      </div>

      <div className="sk-vault-body sk-scroll">
        <div className="sk-vault-inner">
          <div>
            <h2 className="sk-h2">{t('vault.title')}</h2>
            <p className="sk-muted" style={{ marginTop: 4 }}>{t('vault.intro')}</p>
          </div>

          {ocr === false && <div className="sk-note">{t('vault.ocrOff')}</div>}
          {errors.length > 0 && <div className="sk-err" role="alert">{errors.join(' · ')}</div>}

          <section>
            <h3 className="sk-h3">{t('vault.apps')}</h3>
            <div className="sk-stats">
              <div className="sk-stat"><b>{cases.length}</b><span>{t('vault.appsStarted')}</span></div>
              <div className="sk-stat"><b>{submitted.length}</b><span>{t('vault.appsSubmitted')}</span></div>
              <div className="sk-stat"><b>{scholDone.length}<span style={{ fontSize: 16, color: 'var(--ink3)' }}> / {schol.length}</span></b><span>{t('vault.scholarships')}</span></div>
              <div className="sk-stat"><b>{valid}<span style={{ fontSize: 16, color: 'var(--ink3)' }}> / {vault.length}</span></b><span>{t('vault.validPapers')}</span></div>
            </div>
            {cases.length > 0 && (
              <div className="sk-card sk-list" style={{ marginTop: 14, padding: '4px 14px' }}>
                {cases.slice(0, 8).map((c) => {
                  const s = SCHEME_BY_ID[c.schemeId];
                  return (
                    <div className="sk-item" key={c.id} style={{ alignItems: 'center' }}>
                      <span className="ico"><Icon name={s.category} size={18} /></span>
                      <div className="body"><b>{tx(s.name)}</b><p>{c.id} · {new Date(c.createdAt).toLocaleDateString()}</p></div>
                      <span className={`sk-chip ${c.submittedAt ? 'ok' : 'warn'}`}>{c.submittedAt ? t('status.submitted') : t('vault.inProgress')}</span>
                      {!c.submittedAt && <button className="sk-btn sm ghost" onClick={() => resume(c.id)}>{t('common.resume')}</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="sk-h3">{t('vault.folders')} <span className="sk-count">{VAULT_FOLDERS.length}</span></h3>
            <div className="sk-folders">
              {VAULT_FOLDERS.map((f) => (
                <button key={f} className={`sk-folder${folder === f ? ' on' : ''}`} style={{ background: FOLDER_STYLE[f].bg }} onClick={() => setFolder(folder === f ? null : f)} aria-pressed={folder === f}>
                  <div className="top"><span className="name">{t(`vault.folder.${f}`)}</span><span className="ico"><Icon name={FOLDER_STYLE[f].icon} size={18} /></span></div>
                  <div className="sub">{t('vault.papers', { count: counts[f].length })}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="sk-h3">
              {folder ? t(`vault.folder.${folder}`) : t('vault.all')} <span className="sk-count">{shown.length}</span>
              {(valid > 0 || check > 0 || invalid > 0) && (
                <span className="sk-row" style={{ marginLeft: 'auto' }}>
                  <span className="sk-chip ok">{valid} {t('vault.status.valid')}</span>
                  <span className="sk-chip warn">{check} {t('vault.status.check')}</span>
                  <span className="sk-chip bad">{invalid} {t('vault.status.invalid')}</span>
                </span>
              )}
            </h3>
            {shown.length === 0 ? (
              <div className={`sk-drop${over ? ' over' : ''}`}>
                <Icon name="upload" size={26} />
                <p style={{ marginTop: 8, fontWeight: 600, color: 'var(--ink)' }}>{t('vault.empty')}</p>
                <p className="sk-small" style={{ marginTop: 2 }}>{t('vault.emptyHint')}</p>
                <button className="sk-btn ghost" style={{ marginTop: 12 }} onClick={() => void pick()}>{t('vault.add')}</button>
              </div>
            ) : (
              <div className="sk-col">{shown.map((d) => <DocCard key={d.id} d={d} />)}</div>
            )}
          </section>
          <p className="sk-hint">{t('vault.privacy')}</p>
        </div>
      </div>
    </div>
  );
}
