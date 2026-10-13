/**
 * Conversations with the counters. Greetings and the desk "tool" cards are rendered fresh from the current
 * language every time (so a language switch re-words them); only what was actually said is stored.
 */
import { create } from 'zustand';
import type { DeskId } from '@shared/govt/cases';

export type Block =
  | { type: 'schemes'; ids: string[] }
  | { type: 'verdict'; caseId: string };

export interface Msg {
  id: string;
  role: 'user' | 'agent';
  text: string;
  blocks?: Block[];
  ts: number;
}

type Threads = Partial<Record<DeskId, Msg[]>>;
const KEY = 'skeemo.chat.v1';
const MAX = 60;

function load(): Threads {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Threads;
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}
function save(t: Threads): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* storage unavailable — chats just do not persist */ }
}

interface ChatState {
  threads: Threads;
  /** Counters currently "typing". */
  busy: Partial<Record<DeskId, boolean>>;
  push: (desk: DeskId, ...msgs: Msg[]) => void;
  setBusy: (desk: DeskId, on: boolean) => void;
  clear: (desk: DeskId) => void;
}

export const useChat = create<ChatState>((set, get) => ({
  threads: load(),
  busy: {},
  push: (desk, ...msgs) => {
    const threads = { ...get().threads, [desk]: [...(get().threads[desk] ?? []), ...msgs].slice(-MAX) };
    save(threads);
    set({ threads });
  },
  setBusy: (desk, on) => set((s) => ({ busy: { ...s.busy, [desk]: on } })),
  clear: (desk) => {
    const threads = { ...get().threads };
    delete threads[desk];
    save(threads);
    set({ threads });
  },
}));

export const mid = (): string => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
