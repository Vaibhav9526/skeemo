import { create } from 'zustand';
import type { CitizenProfile } from '@shared/govt/profile';
import type { CaseFile, DeskId } from '@shared/govt/cases';
import type { GovtSettingsView } from '../../../preload';
import type { VaultDoc } from '@shared/govt/vaultTypes';
import type { SchemeCategory } from '@shared/govt/schemes';
import { floor } from '@/scene/govt/floorBus';
import type { MapStyle } from '@/scene/govt/layout';
import { setLanguage } from '@/i18n';

export type Settings = GovtSettingsView;
export type View = 'office' | 'chat' | 'vault';

/** What Reception hands to Registration along with the file. */
export interface Prefill { category?: SchemeCategory; schemeId?: string }

interface State {
  ready: boolean;
  profile: CitizenProfile | null;
  settings: Settings | null;
  cases: CaseFile[];
  vault: VaultDoc[];
  activeCaseId: string | null;
  view: View;
  /** The counter whose conversation is open (and where the citizen stands on the floor). */
  desk: DeskId;
  prefill: Prefill;
  /** Classic pixel tilemap or the illustrated Modern map. */
  style: MapStyle;
  /** Scheme whose notice is open in front of the notice board. */
  noticeId: string | null;
  settingsOpen: boolean;
  profileOpen: boolean;
  aiAvailable: boolean | null;
  ocrAvailable: boolean | null;
  /** Lines the peon / counters add to a conversation ("Ramu Kaka carried your file …"). */
  handoffs: Array<{ id: string; desk: DeskId; text: string; ts: number }>;

  boot: () => Promise<void>;
  setProfile: (p: CitizenProfile | null) => void;
  setSettings: (s: Settings) => void;
  setLang: (code: string) => Promise<void>;
  setView: (v: View) => void;
  setStyle: (s: MapStyle) => void;
  openNotice: (id: string | null) => void;
  /** Pick a counter without leaving the room you are in (the Office dock follows it). */
  selectDesk: (d: DeskId) => void;
  /** Open a counter's conversation (and walk the citizen there on the floor). */
  openDesk: (d: DeskId) => void;
  setSettingsOpen: (v: boolean) => void;
  setProfileOpen: (v: boolean) => void;
  sendToRegistration: (prefill: Prefill) => void;
  resumeCase: (id: string) => void;
  registerScheme: (schemeId: string) => Promise<CaseFile | null>;
  replaceCase: (c: CaseFile) => void;
  /** The peon carries the active file from one counter to the next. */
  sendFile: (to: DeskId) => Promise<void>;
  removeCase: (id: string) => Promise<void>;
  refreshVault: () => Promise<void>;
  addHandoff: (desk: DeskId, text: string) => void;
}

function loadStyle(): MapStyle {
  try { return window.localStorage.getItem('skeemo.style') === 'modern' ? 'modern' : 'classic'; } catch { return 'classic'; }
}

const uid = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const useGovt = create<State>((set, get) => ({
  ready: false, profile: null, settings: null, cases: [], vault: [], activeCaseId: null, view: 'office', desk: 'reception',
  prefill: {}, style: loadStyle(), noticeId: null, settingsOpen: false, profileOpen: false, aiAvailable: null, ocrAvailable: null, handoffs: [],

  boot: async () => {
    const [profile, settings, cases, vault] = await Promise.all([
      window.cth.govtProfileGet(), window.cth.govtSettingsGet(), window.cth.govtCasesList(), window.cth.govtVaultList().catch(() => []),
    ]);
    if (settings.language) setLanguage(settings.language);
    set({ profile, settings, cases, vault, ready: true, activeCaseId: cases.find((c) => !c.submittedAt)?.id ?? null });
    void window.cth.govtAiStatus().then((a) => set({ aiAvailable: a.available })).catch(() => set({ aiAvailable: false }));
    void window.cth.govtOcrStatus().then((a) => set({ ocrAvailable: a.available })).catch(() => set({ ocrAvailable: false }));
  },
  setProfile: (profile) => set({ profile }),
  setSettings: (settings) => set({ settings }),
  setLang: async (code) => {
    setLanguage(code);
    set({ settings: await window.cth.govtSettingsSet({ language: code }) });
  },
  setView: (view) => set({ view }),
  setStyle: (style) => { try { window.localStorage.setItem('skeemo.style', style); } catch { /* not persisted */ } set({ style }); },
  openNotice: (noticeId) => set({ noticeId }),
  selectDesk: (desk) => set({ desk }),
  // From the Office the dock simply follows the counter; from the Vault we jump to the focus chat.
  openDesk: (desk) => {
    set({ desk, view: get().view === 'vault' ? 'chat' : get().view });
    floor({ type: 'walk', to: desk });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),

  sendToRegistration: (prefill) => {
    set({ prefill });
    floor({ type: 'file', from: 'reception', to: 'registration', label: 'Registration' });
    get().addHandoff('registration', 'reception');
    get().openDesk('registration');
  },

  resumeCase: (id) => {
    const c = get().cases.find((x) => x.id === id);
    if (!c) return;
    set({ activeCaseId: id });
    get().openDesk(c.desk === 'reception' ? 'registration' : c.desk);
  },

  registerScheme: async (schemeId) => {
    const r = await window.cth.govtCaseCreate(schemeId);
    if (!r.ok) return null;
    const moved = (await window.cth.govtCaseMove(r.case.id, 'documents')) ?? r.case;
    set((s) => ({ cases: [moved, ...s.cases], activeCaseId: moved.id, prefill: {} }));
    floor({ type: 'file', from: 'registration', to: 'documents', label: moved.id });
    get().addHandoff('documents', 'registration');
    get().openDesk('documents');
    return moved;
  },

  replaceCase: (c) => set((s) => ({ cases: s.cases.map((x) => (x.id === c.id ? c : x)) })),

  sendFile: async (to) => {
    const { activeCaseId, desk } = get();
    if (!activeCaseId) return;
    const moved = await window.cth.govtCaseMove(activeCaseId, to);
    if (moved) get().replaceCase(moved);
    floor({ type: 'file', from: desk, to, label: activeCaseId });
    get().addHandoff(to, desk);
    get().openDesk(to);
  },

  removeCase: async (id) => {
    await window.cth.govtCaseRemove(id);
    set((s) => ({ cases: s.cases.filter((c) => c.id !== id), activeCaseId: s.activeCaseId === id ? null : s.activeCaseId }));
  },

  refreshVault: async () => { set({ vault: await window.cth.govtVaultList().catch(() => []) }); },

  /** `text` is the DeskId the file came from; the chat renders the sentence in the current language. */
  addHandoff: (desk, text) => set((s) => ({ handoffs: [...s.handoffs.slice(-30), { id: uid(), desk, text, ts: Date.now() }] })),
}));

export const useActiveCase = (): CaseFile | null =>
  useGovt((s) => s.cases.find((c) => c.id === s.activeCaseId) ?? null);
