/** IPC for Samadhaan: profile, case files, document fitting + verification, AI desks, voice, SuperJargon. */
import { app, BrowserWindow, clipboard, dialog, safeStorage, shell } from 'electron';
import type { IpcMain } from 'electron';
import { spawn } from 'node:child_process';
import { basename, isAbsolute, join } from 'node:path';
import { statSync } from 'node:fs';
import { GovtStore, type GovtSettings } from './store';
import { validateProfile, type ProfileDraft } from '../../shared/govt/profile';
import { isDeskId, type CaseFile } from '../../shared/govt/cases';
import { DOCS, isDocId, type DocId } from '../../shared/govt/documents';
import { SCHEME_BY_ID, isSchemeId, searchSchemes } from '../../shared/govt/schemes';
import { evaluate } from '../../shared/govt/eligibility';
import { isGovtLang, languageInfo } from '../../shared/govt/languages';
import { fitFile } from './docFit';
import { verifyDocument } from './docVerify';
import { helpAnswer, matchSchemes, offlineHelp, type HelpTurn } from './ai';
import { TranslationCache } from './translate';
import { DESK_VOICES, MAX_AUDIO_BYTES, speak, transcribe } from './speech';
import { findSuperJargon, guidePrompt, isSafePortal, startDetached } from './formGuide';
import { ocrFile, ocrSupported } from './ocr';
import { Vault, VAULT_EXT } from './vault';
import { analyzeDocument } from '../../shared/govt/analysis';
import { runClaudeOnce } from '../llm';
import { isVoiceId } from '../voice';

const CASE = /^SMD-\d{4}-[0-9A-F]{6}$/;
const MAX_TEXT = 2000;

let store: GovtStore | null = null;
let translations: TranslationCache | null = null;
const root = () => join(app.getPath('userData'), 'samadhaan');
const getStore = () => (store ??= new GovtStore(root()));
const getTranslations = () => (translations ??= new TranslationCache(root()));
let vault: Vault | null = null;
const getVault = () => (vault ??= new Vault(join(root(), 'vault')));

/** The folder fitted, upload-ready files are written to (visible to the citizen). */
const outDirFor = (caseId: string) => join(app.getPath('documents'), 'Skeemo', caseId);

function readKey(): string {
  const enc = getStore().getSecret();
  if (!enc || !safeStorage.isEncryptionAvailable()) return '';
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
}

// Is the Claude Code CLI reachable? Checked once, then cached for a minute.
let aiProbe: { at: number; ok: boolean } | null = null;
function probeAi(): Promise<boolean> {
  if (aiProbe && Date.now() - aiProbe.at < 60_000) return Promise.resolve(aiProbe.ok);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => { if (done) return; done = true; aiProbe = { at: Date.now(), ok }; resolve(ok); };
    try {
      const child = spawn('claude', ['--version'], { shell: process.platform === 'win32', windowsHide: true });
      const t = setTimeout(() => { try { child.kill(); } catch { /* gone */ } finish(false); }, 8000);
      child.on('error', () => { clearTimeout(t); finish(false); });
      child.on('close', (code) => { clearTimeout(t); finish(code === 0); });
    } catch { finish(false); }
  });
}

const str = (v: unknown, max = MAX_TEXT): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const lang = (v: unknown): string => (isGovtLang(v) ? v : 'en');

function publicSettings(s: GovtSettings) {
  return { ...s, hasKey: !!readKey(), encrypted: safeStorage.isEncryptionAvailable(), defaultVoices: DESK_VOICES, superJargonFound: !!findSuperJargon(s.superJargonPath) };
}

export function registerGovtIpc(ipcMain: Pick<IpcMain, 'handle'>): void {
  // ── profile ──
  ipcMain.handle('govt:profile:get', () => getStore().getProfile());
  ipcMain.handle('govt:profile:save', (_e, draft: unknown) => {
    const r = validateProfile((draft ?? {}) as ProfileDraft);
    if (!r.ok) return { ok: false as const, issues: r.issues };
    const prev = getStore().getProfile();
    getStore().saveProfile({ ...r.profile, createdAt: prev?.createdAt ?? r.profile.createdAt });
    return { ok: true as const, profile: getStore().getProfile() };
  });
  ipcMain.handle('govt:profile:clear', () => { getStore().clearProfile(); return { ok: true as const }; });

  // ── settings ──
  ipcMain.handle('govt:settings:get', () => publicSettings(getStore().getSettings()));
  ipcMain.handle('govt:settings:set', (_e, patch: unknown) => {
    const p = (patch ?? {}) as Record<string, unknown>;
    const next: Partial<GovtSettings> = {};
    if (isGovtLang(p.language)) next.language = p.language;
    if (typeof p.autoVoice === 'boolean') next.autoVoice = p.autoVoice;
    if (typeof p.aiDocRead === 'boolean') next.aiDocRead = p.aiDocRead;
    if (typeof p.superJargonPath === 'string' && p.superJargonPath.length < 500) next.superJargonPath = p.superJargonPath;
    if (p.voices && typeof p.voices === 'object') {
      const cur = { ...getStore().getSettings().voices };
      for (const [desk, id] of Object.entries(p.voices as Record<string, unknown>)) {
        if (!(desk in DESK_VOICES)) continue;
        if (typeof id === 'string' && id.trim() && id.trim() !== DESK_VOICES[desk] && isVoiceId(id.trim())) cur[desk] = id.trim();
        else delete cur[desk];
      }
      next.voices = cur;
    }
    return publicSettings(getStore().saveSettings(next));
  });
  ipcMain.handle('govt:aiStatus', async () => ({ available: await probeAi() }));

  // ── case files ──
  ipcMain.handle('govt:cases:list', () => getStore().listCases());
  ipcMain.handle('govt:cases:create', (_e, schemeId: unknown) => {
    if (!isSchemeId(schemeId)) return { ok: false as const, error: 'Unknown scheme.' };
    return { ok: true as const, case: getStore().createCase(schemeId) };
  });
  ipcMain.handle('govt:cases:move', (_e, id: unknown, desk: unknown) => {
    if (typeof id !== 'string' || !CASE.test(id) || !isDeskId(desk)) return null;
    return getStore().moveCase(id, desk);
  });
  ipcMain.handle('govt:cases:answers', (_e, id: unknown, answers: unknown) => {
    if (typeof id !== 'string' || !CASE.test(id)) return null;
    return getStore().setAnswers(id, (answers ?? {}) as never);
  });
  ipcMain.handle('govt:cases:remove', (_e, id: unknown) => ({ ok: typeof id === 'string' && CASE.test(id) && getStore().removeCase(id) }));
  ipcMain.handle('govt:cases:removeDoc', (_e, id: unknown, docId: unknown) => {
    if (typeof id !== 'string' || !CASE.test(id) || !isDocId(docId)) return null;
    return getStore().removeDoc(id, docId);
  });
  ipcMain.handle('govt:cases:submitted', (_e, id: unknown) => (typeof id === 'string' && CASE.test(id) ? getStore().markSubmitted(id) : null));

  /** Run the eligibility rules on the saved answers, save the verdict on the file, return it. */
  ipcMain.handle('govt:eligibility:run', (_e, id: unknown) => {
    if (typeof id !== 'string' || !CASE.test(id)) return null;
    const profile = getStore().getProfile();
    const c = getStore().getCase(id);
    if (!profile || !c) return null;
    const verdict = evaluate(SCHEME_BY_ID[c.schemeId], profile, c.answers);
    if (verdict.status === 'incomplete') return { case: c, verdict };
    const saved = getStore().setEligibility(id, verdict.status === 'eligible' ? 'eligible' : 'ineligible');
    return { case: saved ?? c, verdict };
  });

  // ── documents ──
  ipcMain.handle('govt:docs:pick', async (evt, docId: unknown) => {
    if (!isDocId(docId)) return { ok: false as const };
    const win = BrowserWindow.fromWebContents(evt.sender);
    const exts = DOCS[docId].formats.flatMap((f) => (f === 'jpg' ? ['jpg', 'jpeg'] : [f]));
    const opts = { title: `Choose: ${DOCS[docId].name.en}`, properties: ['openFile' as const], filters: [{ name: 'Document', extensions: [...exts, 'webp', 'bmp'] }, { name: 'All files', extensions: ['*'] }] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths[0]) return { ok: false as const };
    const path = res.filePaths[0];
    try { return { ok: true as const, path, name: basename(path), size: statSync(path).size }; } catch { return { ok: false as const }; }
  });

  /** Fit a file to the portal's rules, read it (local OCR first, optional AI on top) and file the report on the case. */
  async function checkIntoCase(caseId: string, docId: DocId, path: string, limitKBIn: unknown, displayName?: string) {
    const c = getStore().getCase(caseId);
    const profile = getStore().getProfile();
    if (!c || !profile) return { ok: false as const, error: 'No such case file.' };
    const spec = DOCS[docId];
    const limitKB = typeof limitKBIn === 'number' && limitKBIn >= 5 && limitKBIn <= 20_000 ? Math.round(limitKBIn) : spec.maxKB;
    const name = displayName ?? basename(path);
    const settings = getStore().getSettings();
    const fit = await fitFile({ path, name, formats: spec.formats, maxKB: limitKB, minKB: spec.minKB, outDir: outDirFor(c.id) });
    const useAi = settings.aiDocRead && (await probeAi());
    const incomeLimit = SCHEME_BY_ID[c.schemeId]?.rule.maxIncome;
    const ocr = spec.imageOnly || fit.action === 'failed' ? null : await ocrFile(path, name);
    const v = await verifyDocument({
      docId, originalPath: path, originalName: name, fit, limitKB, profile,
      llm: useAi ? (prompt, ms, files) => runClaudeOnce(prompt, ms, files) : null, incomeLimit,
      ocrText: ocr && ocr.ok ? ocr.text : undefined,
    });
    const record = {
      docId, originalName: name, fittedPath: fit.outPath, fittedName: fit.outName,
      bytesBefore: fit.bytesBefore, bytesAfter: fit.bytesAfter, limitKB, status: v.status, checks: v.checks,
      ...(v.fields ? { fields: v.fields } : {}), at: Date.now(),
    };
    // A file that could not be fitted has no output — keep the report but do not store a dead path.
    const saved = fit.action === 'failed' ? c : (getStore().setDoc(c.id, record) ?? c);
    return { ok: true as const, record, case: saved };
  }

  ipcMain.handle('govt:docs:verify', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { caseId?: unknown; docId?: unknown; path?: unknown; limitKB?: unknown };
    if (typeof p.caseId !== 'string' || !CASE.test(p.caseId) || !isDocId(p.docId) || typeof p.path !== 'string' || !isAbsolute(p.path) || /[\u0000-\u001f]/.test(p.path)) {
      return { ok: false as const, error: 'Invalid request.' };
    }
    return checkIntoCase(p.caseId, p.docId, p.path, p.limitKB);
  });

  // ── the vault ──
  ipcMain.handle('govt:ocr:status', () => ({ available: ocrSupported() }));
  ipcMain.handle('govt:vault:list', () => getVault().list());
  ipcMain.handle('govt:vault:pick', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const opts = { title: 'Add papers to your vault', properties: ['openFile' as const, 'multiSelections' as const], filters: [{ name: 'Documents', extensions: [...VAULT_EXT].map((e) => e.slice(1)) }] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? [] : res.filePaths.slice(0, 20);
  });
  ipcMain.handle('govt:vault:add', async (_e, paths: unknown) => {
    const profile = getStore().getProfile();
    if (!profile) return { added: [], errors: ['Set up your profile first.'] };
    const list = (Array.isArray(paths) ? paths : []).filter((p): p is string => typeof p === 'string' && isAbsolute(p) && !/[\u0000-\u001f]/.test(p)).slice(0, 20);
    const added = [];
    const errors: string[] = [];
    for (const path of list) {
      const name = basename(path);
      const ocr = await ocrFile(path, name);
      const analysis = analyzeDocument(ocr.ok ? ocr.text : '', profile);
      const r = getVault().add(path, name, analysis, ocr.ok ? ocr.via : 'none');
      if (r.ok) added.push(r.doc); else errors.push(`${name}: ${r.error}`);
    }
    return { added, errors };
  });
  ipcMain.handle('govt:vault:remove', (_e, id: unknown) => ({ ok: typeof id === 'string' && getVault().remove(id) }));
  ipcMain.handle('govt:vault:reveal', (_e, id: unknown) => {
    const p = typeof id === 'string' ? getVault().pathOf(id) : null;
    if (!p) return { ok: false as const };
    shell.showItemInFolder(p);
    return { ok: true as const };
  });
  /** Use a vault paper for a case requirement — fitted and checked exactly like a fresh upload. */
  ipcMain.handle('govt:vault:use', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { vaultId?: unknown; caseId?: unknown; docId?: unknown; limitKB?: unknown };
    if (typeof p.vaultId !== 'string' || typeof p.caseId !== 'string' || !CASE.test(p.caseId) || !isDocId(p.docId)) return { ok: false as const, error: 'Invalid request.' };
    const path = getVault().pathOf(p.vaultId);
    if (!path) return { ok: false as const, error: 'That paper is no longer in the vault.' };
    return checkIntoCase(p.caseId, p.docId, path, p.limitKB, getVault().get(p.vaultId)?.name);
  });

  ipcMain.handle('govt:docs:reveal', (_e, id: unknown, docId: unknown) => {
    if (typeof id !== 'string' || !CASE.test(id) || !isDocId(docId)) return { ok: false as const };
    const rec = getStore().getCase(id)?.docs[docId];
    if (!rec?.fittedPath) return { ok: false as const };
    shell.showItemInFolder(rec.fittedPath);
    return { ok: true as const };
  });
  ipcMain.handle('govt:docs:openFolder', async (_e, id: unknown) => {
    if (typeof id !== 'string' || !CASE.test(id)) return { ok: false as const };
    const err = await shell.openPath(outDirFor(id));
    return err ? { ok: false as const, error: err } : { ok: true as const };
  });

  // ── AI desks (each has an offline fallback) ──
  ipcMain.handle('govt:ai:match', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { text?: unknown; lang?: unknown };
    const text = str(p.text, 1500)?.trim();
    if (!text) return { ok: false as const, error: 'Type or say what you need first.' };
    const offline = searchSchemes(text, 3).map((s) => s.id);
    if (await probeAi()) {
      const r = await matchSchemes((prompt, ms) => runClaudeOnce(prompt, ms), { text, lang: lang(p.lang), profile: getStore().getProfile() });
      if (r.ok && r.ids.length) return { ok: true as const, ids: r.ids, reply: r.reply, ai: true };
      if (r.ok) return { ok: true as const, ids: offline, reply: r.reply, ai: true };
    }
    return { ok: true as const, ids: offline, reply: '', ai: false };
  });

  ipcMain.handle('govt:ai:help', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { question?: unknown; lang?: unknown; caseId?: unknown; history?: unknown };
    const question = str(p.question, 1500)?.trim();
    if (!question) return { ok: false as const, error: 'Ask your question first.' };
    const c = typeof p.caseId === 'string' && CASE.test(p.caseId) ? getStore().getCase(p.caseId) : null;
    const scheme = c ? SCHEME_BY_ID[c.schemeId] ?? null : null;
    const history: HelpTurn[] = (Array.isArray(p.history) ? p.history : []).slice(-6).flatMap((t) => {
      const o = (t ?? {}) as { role?: unknown; text?: unknown };
      return (o.role === 'user' || o.role === 'agent') && typeof o.text === 'string' ? [{ role: o.role, text: o.text.slice(0, 800) } as HelpTurn] : [];
    });
    if (await probeAi()) {
      const r = await helpAnswer((prompt, ms) => runClaudeOnce(prompt, ms), { question, lang: lang(p.lang), profile: getStore().getProfile(), scheme, history });
      if (r.ok) return { ok: true as const, reply: r.reply, ai: true };
    }
    return { ok: true as const, reply: offlineHelp(question, scheme), ai: false };
  });

  ipcMain.handle('govt:translate', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { lang?: unknown; strings?: unknown };
    if (!isGovtLang(p.lang) || p.lang === 'en' || !Array.isArray(p.strings)) return { out: [] as string[], pending: false };
    const strings = p.strings.filter((s): s is string => typeof s === 'string').slice(0, 120);
    const cached = getTranslations().peek(p.lang, strings);
    if (cached.every((c, i) => c || !strings[i])) return { out: cached, pending: false };
    if (!(await probeAi())) return { out: cached, pending: false };
    const r = await getTranslations().fill((prompt, ms) => runClaudeOnce(prompt, ms), p.lang, strings);
    return { out: r.out, pending: false };
  });

  // ── voice ──
  ipcMain.handle('govt:voice:setKey', (_e, key: unknown) => {
    if (typeof key !== 'string' || key.length > 200) return { ok: false as const, error: 'Invalid key.' };
    const k = key.trim();
    if (!k) { getStore().saveSecret(''); return { ok: true as const }; }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false as const, error: "This computer can't encrypt secrets, so the key was not saved." };
    getStore().saveSecret(safeStorage.encryptString(k).toString('base64'));
    return { ok: true as const };
  });
  ipcMain.handle('govt:voice:speak', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { text?: unknown; desk?: unknown; lang?: unknown };
    const text = str(p.text, 4000);
    if (!text || typeof p.desk !== 'string' || !(p.desk in DESK_VOICES)) return { ok: false as const, error: 'Nothing to say.' };
    const voice = getStore().getSettings().voices[p.desk] ?? DESK_VOICES[p.desk];
    const r = await speak(readKey(), voice, text, lang(p.lang));
    return r.ok ? { ok: true as const, audio: r.audio.toString('base64') } : { ok: false as const, error: r.error };
  });
  ipcMain.handle('govt:voice:transcribe', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { audio?: unknown; mime?: unknown; lang?: unknown };
    if (typeof p.audio !== 'string' || p.audio.length > MAX_AUDIO_BYTES * 1.4) return { ok: false as const, error: 'No audio.' };
    const r = await transcribe(readKey(), Buffer.from(p.audio, 'base64'), typeof p.mime === 'string' ? p.mime.slice(0, 60) : 'audio/webm', lang(p.lang));
    return r.ok ? { ok: true as const, text: r.text, language: r.language } : { ok: false as const, error: r.error };
  });

  // ── Form Submission → SuperJargon ──
  ipcMain.handle('govt:guide:browse', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const opts = { title: 'Find SuperJargon.exe', properties: ['openFile' as const], filters: [{ name: 'Program', extensions: ['exe'] }] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths[0]) return { ok: false as const };
    const found = findSuperJargon(res.filePaths[0]);
    if (!found) return { ok: false as const, error: 'That is not a program file.' };
    return { ok: true as const, settings: publicSettings(getStore().saveSettings({ superJargonPath: found })) };
  });

  ipcMain.handle('govt:guide:launch', async (_e, payload: unknown) => {
    const p = (payload ?? {}) as { caseId?: unknown; lang?: unknown };
    if (typeof p.caseId !== 'string' || !CASE.test(p.caseId)) return { ok: false as const, error: 'Invalid case.' };
    const c: CaseFile | null = getStore().getCase(p.caseId);
    const profile = getStore().getProfile();
    const scheme = c ? SCHEME_BY_ID[c.schemeId] : null;
    if (!c || !profile || !scheme) return { ok: false as const, error: 'No such case file.' };
    const prompt = guidePrompt({
      schemeName: scheme.name.en, portal: scheme.portal, language: languageInfo(lang(p.lang)).english,
      fields: [
        ['Full name', profile.name], ['Age', String(profile.age)], ['Gender', profile.gender], ['State', profile.state],
        ['Occupation', profile.occupation.replace('_', ' ')], ['Annual family income', `₹${profile.income.toLocaleString('en-IN')}`],
        ['Category', profile.category.toUpperCase()], ['Area', profile.area], ['Application reference', c.id],
        ...Object.values(c.docs).flatMap((d) => (d?.fields?.number ? [[DOCS[d.docId].name.en, d.fields.number] as const] : [])),
        ['Upload-ready files folder', outDirFor(c.id)],
      ],
    });
    clipboard.writeText(prompt);
    let opened = false;
    if (isSafePortal(scheme.portal)) { await shell.openExternal(scheme.portal).then(() => { opened = true; }).catch(() => undefined); }
    const exe = findSuperJargon(getStore().getSettings().superJargonPath);
    let started = false;
    if (exe) { try { startDetached(exe); started = true; } catch { started = false; } }
    return { ok: true as const, started, portalOpened: opened, exe: exe ?? '', prompt };
  });

}
