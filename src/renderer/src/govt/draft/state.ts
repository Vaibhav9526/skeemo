import { create } from 'zustand';
import type { CitizenProfile } from '@shared/govt/profile';
import type { CaseFile, DeskId } from '@shared/govt/cases';
import type { GovtSettingsView } from '../../../../preload';
import type { SchemeCategory } from '@shared/govt/schemes';
import { floor } from '@/scene/govt/draft/floorBusDraft';
import { setLanguage } from '@/i18n';

export type Settings = GovtSettingsView;

/** What Reception hands to Registration along with the file. */
export interface Prefill { category?: SchemeCategory; schemeId?: string }

interface GovtState {
  ready: boolean;
  profile: CitizenProfile | null;
  settings: Settings | null;
  cases: CaseFile[];
  activeCaseId: string | null;
  desk: DeskId | null;
  prefill: Prefill;
  settingsOpen: boolean;
  profileOpen: boolean;
  aiAvailable: boolean | null;

  boot: () => Promise<void>;
  setProfile: (p: CitizenProfile | null) => void;
  setSettings: (s: Settings) => void;
  setLang: (code: string) => Promise<void>;
  openDesk: (d: DeskId | null) => void;
  setSettingsOpen: (v: boolean) => void;
  setProfileOpen: (v: boolean) => void;
  /** Reception → Registration, with what the citizen picked. */
  sendToRegistration: (prefill: Prefill) => void;
  /** Open a case file (creates nothing) and walk to the counter it is waiting at. */
  resumeCase: (id: string) => void;
  /** Register a scheme: creates the file and sends it on to Document Verification. */
  registerScheme: (schemeId: string) => Promise<CaseFile | null>;
  replaceCase: (c: CaseFile) => void;
  /** The peon carries the active file from one counter to the next. */
  sendFile: (to: DeskId) => Promise<void>;
  removeCase: (id: string) => Promise<void>;
}

export const useGovt = create<GovtState>((set, get) => ({
  ready: false, profile: null, settings: null, cases: [], activeCaseId: null, desk: null, prefill: {},
  settingsOpen: false, profileOpen: false, aiAvailable: null,

  boot: async () => {
    const [profile, settings, cases] = await Promise.all([window.cth.govtProfileGet(), window.cth.govtSettingsGet(), window.cth.govtCasesList()]);
    if (settings.language) setLanguage(settings.language);
    set({ profile, settings, cases, ready: true, activeCaseId: cases.find((c) => !c.submittedAt)?.id ?? null });
    void window.cth.govtAiStatus().then((a) => set({ aiAvailable: a.available })).catch(() => set({ aiAvailable: false }));
  },
  setProfile: (profile) => set({ profile }),
  setSettings: (settings) => set({ settings }),
  setLang: async (code) => {
    setLanguage(code);
    set({ settings: await window.cth.govtSettingsSet({ language: code }) });
  },
  openDesk: (desk) => {
    set({ desk });
    if (desk) floor({ type: 'walk', to: desk });
    floor({ type: 'focus', desk });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),

  sendToRegistration: (prefill) => {
    set({ prefill });
    floor({ type: 'file', from: 'reception', to: 'registration', label: 'Registration' });
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
    get().openDesk('documents');
    return moved;
  },

  replaceCase: (c) => set((s) => ({ cases: s.cases.map((x) => (x.id === c.id ? c : x)) })),

  sendFile: async (to) => {
    const { activeCaseId, desk } = get();
    if (!activeCaseId) return;
    const moved = await window.cth.govtCaseMove(activeCaseId, to);
    if (moved) get().replaceCase(moved);
    floor({ type: 'file', from: desk ?? 'reception', to, label: activeCaseId });
    get().openDesk(to);
  },

  removeCase: async (id) => {
    await window.cth.govtCaseRemove(id);
    set((s) => ({ cases: s.cases.filter((c) => c.id !== id), activeCaseId: s.activeCaseId === id ? null : s.activeCaseId }));
  },
}));

export const useActiveCase = (): CaseFile | null =>
  useGovt((s) => s.cases.find((c) => c.id === s.activeCaseId) ?? null);
